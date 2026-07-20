const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const SPLIT = 1, STEAL = 2;
const POT = ethers.parseEther("1");

describe("SplitOrSteal", function () {
  let sos, token, owner, a, b, c;

  async function fresh(minHold = 0n, cooldown = 0) {
    [owner, a, b, c] = await ethers.getSigners();
    const T = await ethers.getContractFactory("MockToken");
    token = await T.deploy();
    const F = await ethers.getContractFactory("SplitOrSteal");
    sos = await F.deploy(await token.getAddress());
    await sos.createRoom(minHold, POT, cooldown);
    await sos.fundJackpot({ value: ethers.parseEther("10") });
    // give players tokens
    for (const p of [a, b, c]) await token.mint(p.address, ethers.parseEther("1000"));
  }

  function salt() { return ethers.hexlify(ethers.randomBytes(32)); }

  async function startGame() {
    await sos.connect(a).joinQueue(0);
    await sos.connect(b).joinQueue(0);
    return await sos.nextGameId() - 1n;
  }

  async function commitBoth(gid, ca, cb) {
    const sa = salt(), sb = salt();
    await sos.connect(a).commit(gid, await sos.commitHash(ca, sa, a.address));
    await sos.connect(b).commit(gid, await sos.commitHash(cb, sb, b.address));
    return { sa, sb };
  }

  describe("outcomes", function () {
    it("both split: quarter each, half rolls over", async () => {
      await fresh();
      const gid = await startGame();
      const { sa, sb } = await commitBoth(gid, SPLIT, SPLIT);
      const balA = await ethers.provider.getBalance(a.address);
      const balB = await ethers.provider.getBalance(b.address);
      await sos.connect(a).reveal(gid, SPLIT, sa);
      await sos.connect(b).reveal(gid, SPLIT, sb);
      expect(await ethers.provider.getBalance(b.address)).to.be.closeTo(balB + POT / 4n, ethers.parseEther("0.01"));
      expect(await ethers.provider.getBalance(a.address)).to.be.closeTo(balA + POT / 4n, ethers.parseEther("0.01"));
      expect(await sos.jackpot()).to.equal(ethers.parseEther("10") - POT + POT / 2n);
    });

    it("steal vs split: stealer gets half, splitter nothing", async () => {
      await fresh();
      const gid = await startGame();
      const { sa, sb } = await commitBoth(gid, STEAL, SPLIT);
      const balA = await ethers.provider.getBalance(a.address);
      await sos.connect(a).reveal(gid, STEAL, sa);
      await sos.connect(b).reveal(gid, SPLIT, sb);
      expect(await ethers.provider.getBalance(a.address)).to.be.closeTo(balA + POT / 2n, ethers.parseEther("0.01"));
      expect(await sos.jackpot()).to.equal(ethers.parseEther("10") - POT + POT / 2n);
    });

    it("both steal: everything rolls over", async () => {
      await fresh();
      const gid = await startGame();
      const { sa, sb } = await commitBoth(gid, STEAL, STEAL);
      await sos.connect(a).reveal(gid, STEAL, sa);
      await sos.connect(b).reveal(gid, STEAL, sb);
      expect(await sos.jackpot()).to.equal(ethers.parseEther("10"));
      const g = await sos.getGame(gid);
      expect(g.state).to.equal(3); // Settled
    });
  });

  describe("AFK paths", function () {
    it("no commit from one player: active stealer paid as vs splitter, AFK gets nothing", async () => {
      await fresh();
      const gid = await startGame();
      const sa = salt();
      await sos.connect(a).commit(gid, await sos.commitHash(STEAL, sa, a.address));
      await time.increase(121);
      await sos.advanceToReveal(gid);
      const balA = await ethers.provider.getBalance(a.address);
      const balB = await ethers.provider.getBalance(b.address);
      // reveal auto-settles since p2 never committed
      await sos.connect(a).reveal(gid, STEAL, sa);
      const g = await sos.getGame(gid);
      expect(g.state).to.equal(3);
      expect(await ethers.provider.getBalance(a.address)).to.be.closeTo(balA + POT / 2n, ethers.parseEther("0.01"));
      expect(await ethers.provider.getBalance(b.address)).to.equal(balB);
    });

    it("no reveal: AFK counted as split but disqualified from payout", async () => {
      await fresh();
      const gid = await startGame();
      const { sa } = await commitBoth(gid, SPLIT, SPLIT);
      await sos.connect(a).reveal(gid, SPLIT, sa);
      const balB = await ethers.provider.getBalance(b.address);
      await time.increase(301);
      const balA = await ethers.provider.getBalance(a.address);
      await sos.settle(gid);
      // both effectively split: a gets quarter, b disqualified, rest rolls over
      expect(await ethers.provider.getBalance(a.address)).to.equal(balA + POT / 4n);
      expect(await ethers.provider.getBalance(b.address)).to.equal(balB);
      expect(await sos.jackpot()).to.equal(ethers.parseEther("10") - POT + (POT * 3n) / 4n);
    });

    it("nobody commits: full rollover", async () => {
      await fresh();
      const gid = await startGame();
      await time.increase(121);
      await sos.advanceToReveal(gid);
      await time.increase(301);
      await sos.settle(gid);
      expect(await sos.jackpot()).to.equal(ethers.parseEther("10"));
    });
  });

  describe("eligibility and anti-farm", function () {
    it("enforces min hold", async () => {
      await fresh(ethers.parseEther("5000")); // more than minted
      await expect(sos.connect(a).joinQueue(0)).to.be.revertedWith("insufficient hold");
    });

    it("enforces cooldown", async () => {
      await fresh(0n, 600);
      const gid = await startGame();
      const { sa, sb } = await commitBoth(gid, SPLIT, SPLIT);
      await sos.connect(a).reveal(gid, SPLIT, sa);
      await sos.connect(b).reveal(gid, SPLIT, sb);
      await expect(sos.connect(a).joinQueue(0)).to.be.revertedWith("cooldown");
      await time.increase(601);
      await sos.connect(a).joinQueue(0); // ok now
    });

    it("enforces entry cap per period", async () => {
      await fresh();
      await sos.setEntryCap(1, 3600);
      const gid = await startGame();
      const { sa, sb } = await commitBoth(gid, SPLIT, SPLIT);
      await sos.connect(a).reveal(gid, SPLIT, sa);
      await sos.connect(b).reveal(gid, SPLIT, sb);
      await sos.connect(a).joinQueue(0);
      await expect(sos.connect(b).joinQueue(0)).to.be.revertedWith("entry cap");
      await time.increase(3601);
      await sos.connect(b).joinQueue(0); // new period
    });

    it("cannot join while in a game", async () => {
      await fresh();
      await startGame();
      await expect(sos.connect(a).joinQueue(0)).to.be.revertedWith("in game");
    });

    it("blocks under-funded jackpot", async () => {
      await fresh();
      await sos.ownerWithdraw(ethers.parseEther("10"), owner.address);
      await sos.connect(a).joinQueue(0);
      await expect(sos.connect(b).joinQueue(0)).to.be.revertedWith("jackpot low");
    });
  });

  describe("commit-reveal integrity", function () {
    it("rejects wrong salt reveal", async () => {
      await fresh();
      const gid = await startGame();
      const { sa } = await commitBoth(gid, SPLIT, SPLIT);
      await expect(sos.connect(a).reveal(gid, STEAL, sa)).to.be.revertedWith("bad reveal");
      await expect(sos.connect(a).reveal(gid, SPLIT, salt())).to.be.revertedWith("bad reveal");
    });

    it("rejects non-players", async () => {
      await fresh();
      const gid = await startGame();
      await expect(sos.connect(c).commit(gid, ethers.ZeroHash)).to.be.revertedWith("not player");
    });
  });

  describe("room config", function () {
    it("owner can create and update rooms; new room is a config tx", async () => {
      await fresh();
      await sos.createRoom(ethers.parseEther("100"), POT * 2n, 300);
      let r = await sos.getRoom(1);
      expect(r.roundPotSize).to.equal(POT * 2n);
      await sos.updateRoom(1, ethers.parseEther("200"), POT * 3n, 900, false);
      r = await sos.getRoom(1);
      expect(r.minHold).to.equal(ethers.parseEther("200"));
      expect(r.enabled).to.equal(false);
      await expect(sos.connect(a).joinQueue(1)).to.be.revertedWith("room disabled");
    });

    it("non-owner cannot update rooms", async () => {
      await fresh();
      await expect(sos.connect(a).createRoom(0, POT, 0)).to.be.revertedWithCustomError(sos, "OwnableUnauthorizedAccount");
    });
  });

  describe("queue", function () {
    it("can leave queue", async () => {
      await fresh();
      await sos.connect(a).joinQueue(0);
      await sos.connect(a).leaveQueue(0);
      await expect(sos.connect(b).leaveQueue(0)).to.be.revertedWith("not queued");
    });

    it("replaces waiting player who dumped tokens", async () => {
      await fresh(ethers.parseEther("100"));
      await sos.connect(a).joinQueue(0);
      await token.connect(a).transfer(c.address, ethers.parseEther("950"));
      await sos.connect(b).joinQueue(0); // a no longer holds enough, b takes queue spot
      expect(await sos.queue(0)).to.equal(b.address);
    });
  });
});
