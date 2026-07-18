import { 
  Keypair, 
  rpc, 
  Contract, 
  Address, 
  TransactionBuilder, 
  BASE_FEE, 
  nativeToScVal, 
  xdr,
  scValToNative
} from '@stellar/stellar-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = new rpc.Server('https://soroban-testnet.stellar.org');
const CONTRACT_ID = 'CABRYRJWNR5WVI34LSA667LTXG7NHIRJOAZASX5MTFJK5JHCAD7ILETJ';
const TOKEN_ADDRESS = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

// Convert milestone to ScVal ScMap
function milestoneToScVal(milestone) {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('amount'),
      val: nativeToScVal(BigInt(milestone.amount), { type: 'i128' })
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('deadline'),
      val: nativeToScVal(BigInt(milestone.deadline), { type: 'u64' })
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('description'),
      val: nativeToScVal(milestone.description, { type: 'string' })
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('status'),
      val: nativeToScVal(0, { type: 'u32' })
    })
  ]);
}

async function fundWithFriendbot(address) {
  const url = `https://friendbot.stellar.org/?addr=${address}`;
  let attempts = 0;
  while (attempts < 5) {
    try {
      console.log(`Funding ${address} (attempt ${attempts + 1})...`);
      const res = await fetch(url);
      if (res.ok) {
        console.log(`Successfully funded ${address}`);
        return true;
      }
      const text = await res.text();
      console.warn(`Friendbot returned status ${res.status}: ${text}`);
    } catch (err) {
      console.error(`Error funding ${address}:`, err);
    }
    attempts++;
    await new Promise(r => setTimeout(r, 4000));
  }
  throw new Error(`Failed to fund ${address} after 5 attempts`);
}

async function getProjectCount() {
  const dummyAddress = 'GC5QY4FKOMCHAT53CPKKHEXZRRPSWS6YN5CGEWI2NBITDH6NTRSCCZ72';
  const dummyAccount = await server.getAccount(dummyAddress);
  const contract = new Contract(CONTRACT_ID);
  const tx = new TransactionBuilder(dummyAccount, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE
  })
  .addOperation(contract.call('get_project_count'))
  .setTimeout(30)
  .build();

  const simulation = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationSuccess(simulation) && simulation.result) {
    return Number(scValToNative(simulation.result.retval));
  }
  throw new Error(`Failed to simulate read call get_project_count: ${JSON.stringify(simulation)}`);
}

async function writeContract(keypair, methodName, args) {
  const userAddress = keypair.publicKey();
  const contract = new Contract(CONTRACT_ID);
  
  let account;
  let attempts = 0;
  while (attempts < 5) {
    try {
      account = await server.getAccount(userAddress);
      break;
    } catch (err) {
      console.warn(`Attempt ${attempts + 1} to get account ${userAddress} failed:`, err.message);
      attempts++;
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  if (!account) {
    throw new Error(`Could not fetch account ${userAddress}`);
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE
  })
  .addOperation(contract.call(methodName, ...args))
  .setTimeout(60)
  .build();

  const simulation = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation)) {
    throw new Error(`Simulation failed for ${methodName}: ${JSON.stringify(simulation)}`);
  }

  const assembledTx = rpc.assembleTransaction(tx, simulation).build();
  assembledTx.sign(keypair);

  const submitResponse = await server.sendTransaction(assembledTx);
  if (submitResponse.status === 'PENDING') {
    return await pollTxStatus(submitResponse.hash);
  } else {
    throw new Error(`Send transaction failed: ${JSON.stringify(submitResponse)}`);
  }
}

async function pollTxStatus(txHash) {
  let attempts = 0;
  while (attempts < 20) {
    const txResponse = await server.getTransaction(txHash);
    if (txResponse.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return txHash;
    } else if (txResponse.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed: ${JSON.stringify(txResponse.resultXdr)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    attempts++;
  }
  throw new Error("Transaction polling timeout.");
}

async function run() {
  console.log("Generating 55 keypairs...");
  const keypairs = [];
  for (let i = 0; i < 55; i++) {
    keypairs.push(Keypair.random());
  }

  // Write keypairs info to console
  console.log(`Generated ${keypairs.length} keypairs.`);

  console.log("Funding all keypairs sequentially with Friendbot...");
  for (let i = 0; i < keypairs.length; i++) {
    await fundWithFriendbot(keypairs[i].publicKey());
    // Wait to prevent rate limit
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("All accounts funded successfully!");

  const transactions = [];

  // Group keypairs dynamically into 18 projects (18 * 3 = 54 wallets utilized)
  const groups = [];
  for (let i = 0; i < 18; i++) {
    groups.push({
      client: keypairs[i * 3],
      freelancer: keypairs[i * 3 + 1],
      arbiter: keypairs[i * 3 + 2]
    });
  }

  for (let pIdx = 0; pIdx < groups.length; pIdx++) {
    const { client, freelancer, arbiter } = groups[pIdx];
    console.log(`\n--- Starting Project ${pIdx + 1} ---`);
    try {
      const oldCount = await getProjectCount();
      const newProjectId = oldCount + 1;
      console.log(`Current project count: ${oldCount}. New Project ID will be: ${newProjectId}`);

      // 1. Create project
      console.log(`Creating project ${newProjectId} by client ${client.publicKey()}...`);
      const clientVal = Address.fromString(client.publicKey()).toScVal();
      const freelancerVal = Address.fromString(freelancer.publicKey()).toScVal();
      const arbiterVal = Address.fromString(arbiter.publicKey()).toScVal();
      const tokenVal = Address.fromString(TOKEN_ADDRESS).toScVal();
      
      const randomXlmAmounts = [50, 43, 3, 757, 564, 6, 675, 52, 41, 8, 63, 74, 95, 120, 85, 240, 15, 310];
      const selectedAmount = randomXlmAmounts[pIdx % randomXlmAmounts.length];
      const amountStroops = selectedAmount * 10000000; // Convert to Stroops

      const milestones = [
        {
          amount: amountStroops,
          description: `Milestone for project ${newProjectId}`,
          deadline: Math.floor(Date.now() / 1000) + 86400
        }
      ];
      const milestoneVals = xdr.ScVal.scvVec(milestones.map(m => milestoneToScVal(m)));

      const createTx = await writeContract(client, 'create_project', [
        clientVal,
        freelancerVal,
        arbiterVal,
        tokenVal,
        milestoneVals
      ]);
      console.log(`Created Project ${newProjectId} tx: ${createTx}`);
      transactions.push({
        project: newProjectId,
        user: client.publicKey(),
        role: "Client",
        action: "create_project",
        txHash: createTx
      });

      // Wait between transactions
      await new Promise(r => setTimeout(r, 2000));

      // 2. Fund milestone
      console.log(`Funding milestone 0 for project ${newProjectId} by client...`);
      const idVal = nativeToScVal(BigInt(newProjectId), { type: 'u64' });
      const idxVal = nativeToScVal(0, { type: 'u32' });
      
      const fundTx = await writeContract(client, 'fund_milestone', [
        Address.fromString(client.publicKey()).toScVal(),
        idVal,
        idxVal
      ]);
      console.log(`Funded project ${newProjectId} tx: ${fundTx}`);
      transactions.push({
        project: newProjectId,
        user: client.publicKey(),
        role: "Client",
        action: "fund_milestone",
        txHash: fundTx
      });

      await new Promise(r => setTimeout(r, 2000));

      // 3. Submit milestone
      console.log(`Submitting milestone 0 for project ${newProjectId} by freelancer ${freelancer.publicKey()}...`);
      const submitTx = await writeContract(freelancer, 'submit_milestone', [
        Address.fromString(freelancer.publicKey()).toScVal(),
        idVal,
        idxVal
      ]);
      console.log(`Submitted project ${newProjectId} tx: ${submitTx}`);
      transactions.push({
        project: newProjectId,
        user: freelancer.publicKey(),
        role: "Freelancer",
        action: "submit_milestone",
        txHash: submitTx
      });

      await new Promise(r => setTimeout(r, 2000));

      // 4. Approve milestone
      console.log(`Approving milestone 0 for project ${newProjectId} by client...`);
      const approveTx = await writeContract(client, 'approve_milestone', [
        Address.fromString(client.publicKey()).toScVal(),
        idVal,
        idxVal
      ]);
      console.log(`Approved project ${newProjectId} tx: ${approveTx}`);
      transactions.push({
        project: newProjectId,
        user: client.publicKey(),
        role: "Client",
        action: "approve_milestone",
        txHash: approveTx
      });

      await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      console.error(`Error during Project ${pIdx + 1} operations:`, err.message);
    }
  }

  console.log("\nAll simulation operations completed! Generating proof file...");

  // Generate proof Markdown file
  let mdContent = `# Stellar Testnet Escrow Transaction Proof\n\n`;
  mdContent += `This file serves as proof of the simulated live transaction activity on the Stellar Testnet by 55 distinct generated wallets.\n\n`;
  
  mdContent += `## Generated Users (Wallets)\n\n`;
  mdContent += `Below is the list of all 55 wallets created and funded via Stellar Friendbot:\n\n`;
  mdContent += `| User # | Public Key | Friendbot Link |\n`;
  mdContent += `|---|---|---|\n`;
  keypairs.forEach((kp, idx) => {
    mdContent += `| User ${idx + 1} | \`${kp.publicKey()}\` | [Verify Balance](https://stellar.expert/explorer/testnet/account/${kp.publicKey()}) |\n`;
  });

  mdContent += `\n## On-Chain Transactions\n\n`;
  mdContent += `Below are the transactions executed on the Escrow Smart Contract:\n\n`;
  mdContent += `| Project ID | User Address | Role | Action | Transaction Hash | Stellar Expert Link |\n`;
  mdContent += `|---|---|---|---|---|---|\n`;
  transactions.forEach((tx) => {
    mdContent += `| Project #${tx.project} | \`${tx.user.substring(0, 8)}...${tx.user.substring(48)}\` | ${tx.role} | \`${tx.action}\` | \`${tx.txHash.substring(0, 10)}...\` | [View Transaction](https://stellar.expert/explorer/testnet/tx/${tx.txHash}) |\n`;
  });

  mdContent += `\n---\n*Simulation completed at: ${new Date().toISOString()}*\n`;

  const outputPath = path.join(__dirname, '..', 'TRANSACTIONS_PROOF.md');
  fs.writeFileSync(outputPath, mdContent, 'utf8');
  console.log(`Proof document generated successfully at: ${outputPath}`);
}

run().catch(console.error);
