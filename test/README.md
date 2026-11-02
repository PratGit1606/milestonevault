# Tests

Hardhat tests go here (Kamalesh owns this folder). Planned coverage:

- Campaign creation and milestone share validation
- Contributions, funding deadline, goal met and goal missed
- Contribution-weighted voting, quorum, and majority rule
- Tranche release and the last-tranche rounding case
- Resubmission after a rejection and cancellation after a second rejection
- Overdue milestone cancellation
- Pro-rata refunds, double-claim protection, reentrancy attempts

Run with `npx hardhat test`. Target: at least 90% line coverage.
