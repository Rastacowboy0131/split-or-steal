// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Split or Steal (Hug or Rug)
/// @notice Free-entry two-player game. Pot is funded by the token tax wallet.
/// Rooms are parameterized instances in one contract. Commit-reveal choices.
contract SplitOrSteal is Ownable, ReentrancyGuard {
    enum Choice { None, Split, Steal }
    enum GameState { None, WaitingCommit, WaitingReveal, Settled }

    struct Room {
        uint256 minHold;        // min $SoS balance to play
        uint256 roundPotSize;   // native amount allocated per round from jackpot
        uint64 cooldownSecs;    // per-wallet cooldown between games in this room
        bool enabled;
    }

    struct Game {
        uint256 roomId;
        address p1;
        address p2;
        bytes32 commit1;
        bytes32 commit2;
        Choice reveal1;
        Choice reveal2;
        uint64 commitDeadline;
        uint64 revealDeadline;
        uint256 roundPot;
        GameState state;
    }

    IERC20 public sosToken; // placeholder until $SoS launches; address(0) disables hold check
    uint64 public commitWindow = 120;   // seconds to commit
    uint64 public revealWindow = 300;   // generous reveal window

    // global entry cap: max games settled-or-started per period
    uint32 public maxGamesPerPeriod = 20;
    uint64 public periodSecs = 3600;
    uint64 public currentPeriodStart;
    uint32 public gamesThisPeriod;

    uint256 public nextRoomId;
    uint256 public nextGameId = 1;
    mapping(uint256 => Room) public rooms;
    mapping(uint256 => Game) public games;
    mapping(uint256 => address) public queue; // roomId => waiting player
    mapping(address => mapping(uint256 => uint64)) public lastPlayed; // player => roomId => timestamp
    mapping(address => uint256) public activeGame; // player => gameId (0 = none)

    uint256 public jackpot; // native balance earmarked for payouts

    event RoomSet(uint256 indexed roomId, uint256 minHold, uint256 roundPotSize, uint64 cooldownSecs, bool enabled);
    event Queued(uint256 indexed roomId, address indexed player);
    event QueueLeft(uint256 indexed roomId, address indexed player);
    event GameStarted(uint256 indexed gameId, uint256 indexed roomId, address p1, address p2, uint64 commitDeadline, uint256 roundPot);
    event Committed(uint256 indexed gameId, address indexed player);
    event RevealPhase(uint256 indexed gameId, uint64 revealDeadline);
    event Revealed(uint256 indexed gameId, address indexed player, Choice choice);
    event GameSettled(uint256 indexed gameId, Choice c1, Choice c2, uint256 paidP1, uint256 paidP2, uint256 rolledOver);
    event JackpotFunded(address indexed from, uint256 amount);

    constructor(address _sosToken) Ownable(msg.sender) {
        sosToken = IERC20(_sosToken);
        currentPeriodStart = uint64(block.timestamp);
    }

    // ---------- funding ----------

    receive() external payable {
        jackpot += msg.value;
        emit JackpotFunded(msg.sender, msg.value);
    }

    function fundJackpot() external payable {
        jackpot += msg.value;
        emit JackpotFunded(msg.sender, msg.value);
    }

    // ---------- admin ----------

    function setToken(address _sosToken) external onlyOwner {
        sosToken = IERC20(_sosToken);
    }

    function setWindows(uint64 _commitWindow, uint64 _revealWindow) external onlyOwner {
        commitWindow = _commitWindow;
        revealWindow = _revealWindow;
    }

    function setEntryCap(uint32 _maxGamesPerPeriod, uint64 _periodSecs) external onlyOwner {
        maxGamesPerPeriod = _maxGamesPerPeriod;
        periodSecs = _periodSecs;
    }

    /// @notice Create a room. Adding a tier is a config transaction, no redeploy.
    function createRoom(uint256 minHold, uint256 roundPotSize, uint64 cooldownSecs) external onlyOwner returns (uint256 roomId) {
        roomId = nextRoomId++;
        rooms[roomId] = Room(minHold, roundPotSize, cooldownSecs, true);
        emit RoomSet(roomId, minHold, roundPotSize, cooldownSecs, true);
    }

    function updateRoom(uint256 roomId, uint256 minHold, uint256 roundPotSize, uint64 cooldownSecs, bool enabled) external onlyOwner {
        require(roomId < nextRoomId, "no room");
        rooms[roomId] = Room(minHold, roundPotSize, cooldownSecs, enabled);
        emit RoomSet(roomId, minHold, roundPotSize, cooldownSecs, enabled);
    }

    /// @notice Owner escape hatch for stuck funds (jackpot is fee-funded, not player stakes).
    function ownerWithdraw(uint256 amount, address to) external onlyOwner {
        require(amount <= jackpot, "exceeds jackpot");
        jackpot -= amount;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "xfer fail");
    }

    // ---------- entry ----------

    function _checkEligible(address player, uint256 roomId) internal view {
        Room memory r = rooms[roomId];
        require(r.enabled, "room disabled");
        require(activeGame[player] == 0, "in game");
        require(block.timestamp >= lastPlayed[player][roomId] + r.cooldownSecs, "cooldown");
        if (address(sosToken) != address(0)) {
            require(sosToken.balanceOf(player) >= r.minHold, "insufficient hold");
        }
    }

    function _tickPeriod() internal {
        if (block.timestamp >= currentPeriodStart + periodSecs) {
            currentPeriodStart = uint64(block.timestamp);
            gamesThisPeriod = 0;
        }
    }

    function joinQueue(uint256 roomId) external nonReentrant {
        require(roomId < nextRoomId, "no room");
        _checkEligible(msg.sender, roomId);
        _tickPeriod();

        address waiting = queue[roomId];
        if (waiting == address(0)) {
            queue[roomId] = msg.sender;
            emit Queued(roomId, msg.sender);
            return;
        }
        require(waiting != msg.sender, "already queued");

        // start game
        require(gamesThisPeriod < maxGamesPerPeriod, "entry cap");
        Room memory r = rooms[roomId];
        require(jackpot >= r.roundPotSize, "jackpot low");

        // re-check waiting player still eligible (balance may have changed)
        if (address(sosToken) != address(0) && sosToken.balanceOf(waiting) < r.minHold) {
            // replace them in queue
            queue[roomId] = msg.sender;
            emit QueueLeft(roomId, waiting);
            emit Queued(roomId, msg.sender);
            return;
        }

        queue[roomId] = address(0);
        gamesThisPeriod += 1;
        jackpot -= r.roundPotSize;

        uint256 gameId = nextGameId++;
        Game storage g = games[gameId];
        g.roomId = roomId;
        g.p1 = waiting;
        g.p2 = msg.sender;
        g.commitDeadline = uint64(block.timestamp) + commitWindow;
        g.roundPot = r.roundPotSize;
        g.state = GameState.WaitingCommit;

        activeGame[waiting] = gameId;
        activeGame[msg.sender] = gameId;
        lastPlayed[waiting][roomId] = uint64(block.timestamp);
        lastPlayed[msg.sender][roomId] = uint64(block.timestamp);

        emit GameStarted(gameId, roomId, waiting, msg.sender, g.commitDeadline, r.roundPotSize);
    }

    function leaveQueue(uint256 roomId) external {
        require(queue[roomId] == msg.sender, "not queued");
        queue[roomId] = address(0);
        emit QueueLeft(roomId, msg.sender);
    }

    // ---------- commit / reveal ----------

    function commitHash(Choice choice, bytes32 salt, address player) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(uint8(choice), salt, player));
    }

    function commit(uint256 gameId, bytes32 hash) external {
        Game storage g = games[gameId];
        require(g.state == GameState.WaitingCommit, "not commit phase");
        require(block.timestamp <= g.commitDeadline, "commit over");
        if (msg.sender == g.p1) {
            require(g.commit1 == bytes32(0), "committed");
            g.commit1 = hash;
        } else if (msg.sender == g.p2) {
            require(g.commit2 == bytes32(0), "committed");
            g.commit2 = hash;
        } else {
            revert("not player");
        }
        emit Committed(gameId, msg.sender);

        if (g.commit1 != bytes32(0) && g.commit2 != bytes32(0)) {
            g.state = GameState.WaitingReveal;
            g.revealDeadline = uint64(block.timestamp) + revealWindow;
            emit RevealPhase(gameId, g.revealDeadline);
        }
    }

    /// @notice After commit deadline, anyone can advance to reveal phase (AFK committers handled at settle).
    function advanceToReveal(uint256 gameId) external {
        Game storage g = games[gameId];
        require(g.state == GameState.WaitingCommit, "not commit phase");
        require(block.timestamp > g.commitDeadline, "commit not over");
        g.state = GameState.WaitingReveal;
        g.revealDeadline = uint64(block.timestamp) + revealWindow;
        emit RevealPhase(gameId, g.revealDeadline);
    }

    function reveal(uint256 gameId, Choice choice, bytes32 salt) external {
        Game storage g = games[gameId];
        require(g.state == GameState.WaitingReveal, "not reveal phase");
        require(block.timestamp <= g.revealDeadline, "reveal over");
        require(choice == Choice.Split || choice == Choice.Steal, "bad choice");
        if (msg.sender == g.p1) {
            require(g.commit1 != bytes32(0), "no commit");
            require(g.reveal1 == Choice.None, "revealed");
            require(commitHash(choice, salt, msg.sender) == g.commit1, "bad reveal");
            g.reveal1 = choice;
        } else if (msg.sender == g.p2) {
            require(g.commit2 != bytes32(0), "no commit");
            require(g.reveal2 == Choice.None, "revealed");
            require(commitHash(choice, salt, msg.sender) == g.commit2, "bad reveal");
            g.reveal2 = choice;
        } else {
            revert("not player");
        }
        emit Revealed(gameId, msg.sender, choice);

        bool p1Done = g.reveal1 != Choice.None || g.commit1 == bytes32(0);
        bool p2Done = g.reveal2 != Choice.None || g.commit2 == bytes32(0);
        if (p1Done && p2Done) {
            _settle(gameId);
        }
    }

    /// @notice Settle after reveal deadline (handles AFK players).
    function settle(uint256 gameId) external nonReentrant {
        Game storage g = games[gameId];
        require(g.state == GameState.WaitingReveal, "not reveal phase");
        require(block.timestamp > g.revealDeadline, "reveal not over");
        _settle(gameId);
    }

    function _settle(uint256 gameId) internal {
        Game storage g = games[gameId];
        g.state = GameState.Settled;
        activeGame[g.p1] = 0;
        activeGame[g.p2] = 0;

        // AFK players (no commit or no reveal) count as Split for outcome, but are disqualified from payout.
        bool p1Active = g.reveal1 != Choice.None;
        bool p2Active = g.reveal2 != Choice.None;
        Choice c1 = p1Active ? g.reveal1 : Choice.Split;
        Choice c2 = p2Active ? g.reveal2 : Choice.Split;

        uint256 pot = g.roundPot;
        uint256 pay1;
        uint256 pay2;

        if (c1 == Choice.Split && c2 == Choice.Split) {
            // players share half the pot, other half rolls over
            if (p1Active) pay1 = pot / 4;
            if (p2Active) pay2 = pot / 4;
        } else if (c1 == Choice.Steal && c2 == Choice.Split) {
            if (p1Active) pay1 = pot / 2;
        } else if (c1 == Choice.Split && c2 == Choice.Steal) {
            if (p2Active) pay2 = pot / 2;
        }
        // both steal: nothing paid

        uint256 rollover = pot - pay1 - pay2;
        jackpot += rollover;

        if (pay1 > 0) {
            (bool ok1, ) = g.p1.call{value: pay1}("");
            if (!ok1) { jackpot += pay1; pay1 = 0; }
        }
        if (pay2 > 0) {
            (bool ok2, ) = g.p2.call{value: pay2}("");
            if (!ok2) { jackpot += pay2; pay2 = 0; }
        }

        emit GameSettled(gameId, c1, c2, pay1, pay2, rollover);
    }

    // ---------- views ----------

    function getGame(uint256 gameId) external view returns (Game memory) {
        return games[gameId];
    }

    function getRoom(uint256 roomId) external view returns (Room memory) {
        return rooms[roomId];
    }
}
