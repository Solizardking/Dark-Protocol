import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { randomBytes } from "crypto";
import { DarkProtocolProgram } from "../target/types/dark_protocol_program";

// Spend-authorization tests for the v1 note pool. They run against a local
// validator only (see Anchor.toml [[test.genesis]]); nothing touches devnet.

const ENC = 580;
const sol = (x: number) => Math.round(x * LAMPORTS_PER_SOL);
const OUT = 80;

describe("dark-protocol-program: spend authorization", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.darkProtocolProgram as Program<DarkProtocolProgram>;
  const conn = provider.connection;

  const [statePda] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], program.programId);
  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("pool_vault"), statePda.toBuffer()], program.programId);
  const notePda = (cm: Buffer) => PublicKey.findProgramAddressSync([Buffer.from("note"), cm], program.programId)[0];
  const nullPda = (nf: Buffer) => PublicKey.findProgramAddressSync([Buffer.from("nullifier"), nf], program.programId)[0];

  const owner = Keypair.generate();
  const attacker = Keypair.generate();
  const payee = Keypair.generate();

  async function fund(kp: Keypair, sol = 5) {
    const sig = await conn.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
  }

  async function deposit(by: Keypair, lamports: number): Promise<Buffer> {
    const cm = randomBytes(32);
    await program.methods
      .deposit(new BN(lamports), [...cm], new Array(ENC).fill(0), new Array(OUT).fill(0), [...randomBytes(32)])
      .accountsPartial({ protocolState: statePda, shieldedNote: notePda(cm), poolVault: vaultPda, depositor: by.publicKey, systemProgram: SystemProgram.programId })
      .signers([by])
      .rpc();
    return cm;
  }

  function withdraw(cm: Buffer, signer: Keypair, recipient: PublicKey, lamports: number) {
    const nf = randomBytes(32);
    return program.methods
      .withdraw([...nf], new BN(lamports))
      .accountsPartial({
        protocolState: statePda, shieldedNote: notePda(cm), nullifierRecord: nullPda(nf), poolVault: vaultPda,
        owner: signer.publicKey, recipient, systemProgram: SystemProgram.programId,
      })
      .signers([signer])
      .rpc();
  }

  function transfer(cm: Buffer, signer: Keypair, a1: number, a2: number, o1: PublicKey, o2: PublicKey) {
    const nf = randomBytes(32), c1 = randomBytes(32), c2 = randomBytes(32);
    return {
      c1, c2,
      tx: program.methods
        .shieldedTransfer([...nf], [...c1], [...c2], new BN(a1), new BN(a2), o1, o2)
        .accountsPartial({
          protocolState: statePda, inputNote: notePda(cm), nullifierRecord: nullPda(nf),
          outputNote1: notePda(c1), outputNote2: notePda(c2), sender: signer.publicKey, systemProgram: SystemProgram.programId,
        })
        .signers([signer])
        .rpc(),
    };
  }

  async function expectNotOwner(p: Promise<unknown>) {
    try {
      await p;
    } catch (e: any) {
      const code = e?.error?.errorCode?.code ?? String(e);
      assert.include(code, "NotNoteOwner");
      return;
    }
    assert.fail("expected NotNoteOwner");
  }

  before(async () => {
    await Promise.all([fund(owner), fund(attacker), fund(payee, 1)]);
    await program.methods
      .initialize(provider.wallet.publicKey)
      .accountsPartial({ protocolState: statePda, poolVault: vaultPda, payer: provider.wallet.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    // Seed note that is never withdrawn: keeps the vault above the rent-exempt minimum.
    await deposit(owner, LAMPORTS_PER_SOL);
  });

  it("records the depositor as the note owner", async () => {
    const cm = await deposit(owner, sol(0.2));
    const note = await program.account.shieldedNote.fetch(notePda(cm));
    assert.isTrue(note.owner.equals(owner.publicKey));
  });

  it("rejects a withdraw signed by someone who is not the owner", async () => {
    const cm = await deposit(owner, sol(0.3));
    await expectNotOwner(withdraw(cm, attacker, attacker.publicKey, sol(0.3)));
    const note = await program.account.shieldedNote.fetch(notePda(cm));
    assert.isFalse(note.spent, "note must stay unspent");
  });

  it("lets the owner withdraw, to any recipient", async () => {
    const cm = await deposit(owner, sol(0.3));
    const before = await conn.getBalance(payee.publicKey);
    await withdraw(cm, owner, payee.publicKey, sol(0.3));
    const after = await conn.getBalance(payee.publicKey);
    assert.equal(after - before, sol(0.3));
    assert.isTrue((await program.account.shieldedNote.fetch(notePda(cm))).spent);
  });

  it("still rejects a second withdraw of the same note", async () => {
    const cm = await deposit(owner, sol(0.1));
    await withdraw(cm, owner, owner.publicKey, sol(0.1));
    try {
      await withdraw(cm, owner, owner.publicKey, sol(0.1));
      assert.fail("double spend accepted");
    } catch (e: any) {
      assert.include(e?.error?.errorCode?.code ?? String(e), "NoteAlreadySpent");
    }
  });

  it("rejects a shielded_transfer signed by someone who is not the owner", async () => {
    const cm = await deposit(owner, sol(0.4));
    await expectNotOwner(transfer(cm, attacker, sol(0.2), sol(0.2), attacker.publicKey, attacker.publicKey).tx);
    assert.isFalse((await program.account.shieldedNote.fetch(notePda(cm))).spent);
  });

  it("lets the owner transfer, and the outputs belong to the named owners", async () => {
    const cm = await deposit(owner, sol(0.4));
    const { c1, c2, tx } = transfer(cm, owner, sol(0.25), sol(0.15), payee.publicKey, owner.publicKey);
    await tx;
    const n1 = await program.account.shieldedNote.fetch(notePda(c1));
    const n2 = await program.account.shieldedNote.fetch(notePda(c2));
    assert.isTrue(n1.owner.equals(payee.publicKey));
    assert.isTrue(n2.owner.equals(owner.publicKey));

    // the sender can no longer spend the payee's output; the payee can
    await expectNotOwner(withdraw(c1, owner, owner.publicKey, sol(0.25)));
    await withdraw(c1, payee, payee.publicKey, sol(0.25));
  });

  function postCiphertext(cm: Buffer, signer: Keypair, fill: number) {
    return program.methods
      .postCiphertext(new Array(ENC).fill(fill), new Array(OUT).fill(fill), new Array(32).fill(fill))
      .accountsPartial({ note: notePda(cm), authority: signer.publicKey })
      .signers([signer])
      .rpc();
  }

  it("lets only the transfer sender post an output's ciphertext, once", async () => {
    const cm = await deposit(owner, sol(0.2));
    const { c1, tx } = transfer(cm, owner, sol(0.1), sol(0.1), payee.publicKey, owner.publicKey);
    await tx;
    assert.isFalse((await program.account.shieldedNote.fetch(notePda(c1))).ciphertextPosted);
    try {
      await postCiphertext(c1, attacker, 9);
      assert.fail("stranger posted a ciphertext");
    } catch (e: any) {
      assert.include(e?.error?.errorCode?.code ?? String(e), "NotCiphertextAuthority");
    }
    await postCiphertext(c1, owner, 7);
    const n1 = await program.account.shieldedNote.fetch(notePda(c1));
    assert.isTrue(n1.ciphertextPosted);
    assert.equal(n1.encCiphertext[0], 7);
    try {
      await postCiphertext(c1, owner, 8);
      assert.fail("ciphertext overwritten");
    } catch (e: any) {
      assert.include(e?.error?.errorCode?.code ?? String(e), "CiphertextAlreadyPosted");
    }
  });

  it("does not allow re-posting a deposit's ciphertext", async () => {
    const cm = await deposit(owner, sol(0.1));
    try {
      await postCiphertext(cm, owner, 1);
      assert.fail("deposit ciphertext overwritten");
    } catch (e: any) {
      assert.include(e?.error?.errorCode?.code ?? String(e), "CiphertextAlreadyPosted");
    }
  });

  it("rejects a transfer whose outputs don't add up to the input", async () => {
    const cm = await deposit(owner, sol(0.1));
    try {
      await transfer(cm, owner, sol(0.1), 1, owner.publicKey, owner.publicKey).tx;
      assert.fail("value created from nothing");
    } catch (e: any) {
      assert.include(e?.error?.errorCode?.code ?? String(e), "AmountMismatch");
    }
  });
});
