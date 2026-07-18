#![cfg(test)] // Compile only during testing

use super::*;
use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env, String, Vec};

// Helper function to set up the test environment
fn setup_test_env<'a>() -> (
    Env,
    EscrowContractClient<'a>,
    Address,
    Address,
    Address,
    token::Client<'a>,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths(); // Mock authentication for tests

    // Deploy contract
    let contract_id = env.register_contract(None, EscrowContract);
    let client_contract = EscrowContractClient::new(&env, &contract_id);

    // Generate test accounts
    let client = Address::generate(&env);
    let freelancer = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let token_admin = Address::generate(&env);

    // Create token contract
    let token_contract = env.register_stellar_asset_contract_v2(token_admin);
    let token_address = token_contract.address();
    let token_client = token::Client::new(&env, &token_address);

    // Mint test tokens to the client
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&client, &10000);

    (
        env,
        client_contract,
        client,
        freelancer,
        arbiter,
        token_client,
        token_address,
    )
}

#[test]
fn test_happy_path() {
    let (env, contract, client, freelancer, arbiter, token_client, token_address) = setup_test_env();

    // Create project milestones
    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        amount: 200,
        description: String::from_str(&env, "Milestone 1"),
        deadline: 1000,
        status: 0,
    });
    milestones.push_back(Milestone {
        amount: 300,
        description: String::from_str(&env, "Milestone 2"),
        deadline: 2000,
        status: 0,
    });

    // Create project
    let project_id = contract.create_project(
        &client,
        &freelancer,
        &arbiter,
        &token_address,
        &milestones,
    );

    // Verify project creation
    assert_eq!(project_id, 1);
    assert_eq!(contract.get_project_count(), 1);

    let project = contract.get_project(&project_id);
    assert_eq!(project.client, client);
    assert_eq!(project.freelancer, freelancer);
    assert_eq!(project.milestones.len(), 2);

    // Fund first milestone
    contract.fund_milestone(&client, &project_id, &0);

    // Submit first milestone
    contract.submit_milestone(&freelancer, &project_id, &0);

    // Approve and release payment
    contract.approve_milestone(&client, &project_id, &0);

    // Verify milestone status
    let milestone_released = contract.get_milestones(&project_id).get(0).unwrap();
    assert_eq!(milestone_released.status, 5);
}

#[test]
fn test_dispute_and_resolve_to_client() {
    let (env, contract, client, freelancer, arbiter, token_client, token_address) = setup_test_env();

    // Create a project with one milestone
    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        amount: 500,
        description: String::from_str(&env, "Work"),
        deadline: 1000,
        status: 0,
    });

    let project_id = contract.create_project(&client, &freelancer, &arbiter, &token_address, &milestones);

    // Fund and submit milestone
    contract.fund_milestone(&client, &project_id, &0);
    contract.submit_milestone(&freelancer, &project_id, &0);

    // Raise dispute
    contract.dispute_milestone(&client, &project_id, &0, &String::from_str(&env, "Did not meet requirements"));

    // Resolve dispute in client's favor
    contract.resolve_dispute(&arbiter, &project_id, &0, &true);

    // Verify refund
    assert_eq!(token_client.balance(&client), 10000);
}

#[test]
fn test_dispute_and_resolve_to_freelancer() {
    let (env, contract, client, freelancer, arbiter, token_client, token_address) = setup_test_env();

    // Create project
    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        amount: 500,
        description: String::from_str(&env, "Work"),
        deadline: 1000,
        status: 0,
    });

    let project_id = contract.create_project(&client, &freelancer, &arbiter, &token_address, &milestones);

    // Fund, submit and dispute
    contract.fund_milestone(&client, &project_id, &0);
    contract.submit_milestone(&freelancer, &project_id, &0);
    contract.dispute_milestone(&client, &project_id, &0, &String::from_str(&env, "Did not meet requirements"));

    // Resolve dispute in freelancer's favor
    contract.resolve_dispute(&arbiter, &project_id, &0, &false);

    // Verify payment release
    assert_eq!(token_client.balance(&freelancer), 500);
}

#[test]
fn test_client_refund_on_expiry() {
    let (env, contract, client, freelancer, arbiter, token_client, token_address) = setup_test_env();

    // Create milestone with deadline
    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        amount: 400,
        description: String::from_str(&env, "Expired work"),
        deadline: 1000,
        status: 0,
    });

    let project_id = contract.create_project(&client, &freelancer, &arbiter, &token_address, &milestones);

    // Fund milestone
    contract.fund_milestone(&client, &project_id, &0);

    // Move time beyond deadline
    env.ledger().with_mut(|li| {
        li.timestamp = 1001;
    });

    // Refund milestone
    contract.refund_milestone(&client, &project_id, &0);

    // Verify refund
    assert_eq!(token_client.balance(&client), 10000);
}

#[test]
fn test_freelancer_voluntary_refund() {
    let (env, contract, client, freelancer, arbiter, token_client, token_address) = setup_test_env();

    // Create project
    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        amount: 400,
        description: String::from_str(&env, "Voluntary Cancel"),
        deadline: 5000,
        status: 0,
    });

    let project_id = contract.create_project(&client, &freelancer, &arbiter, &token_address, &milestones);

    // Fund milestone
    contract.fund_milestone(&client, &project_id, &0);

    // Freelancer refunds voluntarily
    contract.refund_milestone(&freelancer, &project_id, &0);

    // Verify client receives refund
    assert_eq!(token_client.balance(&client), 10000);
}

#[test]
fn test_unauthorized_actions() {
    let (env, contract, client, freelancer, arbiter, _token_client, token_address) = setup_test_env();

    // Create project
    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        amount: 100,
        description: String::from_str(&env, "Access Test"),
        deadline: 1000,
        status: 0,
    });

    let project_id = contract.create_project(&client, &freelancer, &arbiter, &token_address, &milestones);

    // Verify unauthorized actions fail
    assert!(contract.try_fund_milestone(&freelancer, &project_id, &0).is_err());

    contract.fund_milestone(&client, &project_id, &0);

    assert!(contract.try_submit_milestone(&client, &project_id, &0).is_err());

    contract.submit_milestone(&freelancer, &project_id, &0);

    assert!(contract.try_approve_milestone(&freelancer, &project_id, &0).is_err());
    assert!(contract.try_dispute_milestone(&freelancer, &project_id, &0, &String::from_str(&env, "Dispute!")).is_err());

    // Random user cannot resolve disputes
    let stranger = Address::generate(&env);
    assert!(contract.try_resolve_dispute(&stranger, &project_id, &0, &true).is_err());
}
