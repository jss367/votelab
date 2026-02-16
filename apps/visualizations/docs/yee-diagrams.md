# Understanding Yee Diagrams

Yee diagrams are a visualization tool for understanding how different voting methods behave in a 2D political space. They're named after Ka-Ping Yee, who popularized this approach for comparing electoral systems.

## What the Diagram Shows

Each diagram displays a 2D "political space" where:
- The **x-axis** represents one dimension of political opinion (e.g., economic policy from left to right)
- The **y-axis** represents another dimension (e.g., social policy from libertarian to authoritarian)
- **Candidates** are shown as labeled circles at specific positions
- **Voters** are distributed across the space (configured via the Voter Distribution panel)

## What Each Pixel Color Means

**For each point (pixel) in the diagram, the color indicates which candidate would win an election among the voters near that point.**

Specifically:
1. We look at all voters within a radius of 0.12 (in normalized coordinates) around that point
2. Each voter ranks the candidates by distance—closer candidates are preferred
3. We run the selected voting method using those voters' preferences
4. The pixel is colored according to the winning candidate

This means:
- **Red regions** = Candidate A wins among voters in that area
- **Blue regions** = Candidate B wins among voters in that area
- **Green regions** = Candidate C wins among voters in that area
- And so on for additional candidates

## How Voters Vote

Each voter's ballot is determined by their position relative to the candidates:

1. **Ranking**: Voters rank candidates from closest to farthest (by Euclidean distance)
2. **Approval**: Voters always approve their closest candidate, plus any other candidates within the threshold distance of that closest candidate

For example, a voter at position (0.3, 0.3) with candidates at:
- A at (0.25, 0.25) — distance ≈ 0.07
- B at (0.75, 0.25) — distance ≈ 0.45
- C at (0.5, 0.75) — distance ≈ 0.50

Would rank them A > B > C. For approval (with threshold 0.3):
- Always approves A (closest)
- Approves B if B's distance (0.45) ≤ A's distance (0.07) + threshold (0.3) = 0.37? No, 0.45 > 0.37
- So this voter approves only A

Another voter equidistant from A and B (both at distance 0.2) with threshold 0.3 would approve both, since B's distance (0.2) ≤ A's distance (0.2) + 0.3 = 0.5.

## Voting Methods Explained

### Plurality
Each voter's single first-choice vote counts. The candidate with the most first-choice votes wins.

### Approval
Each voter always approves their closest candidate, plus any additional candidates within the threshold distance of that closest candidate. The candidate with the most approvals wins. This ensures every voter approves at least one candidate and prevents voters from approving all candidates.

### Instant Runoff (IRV)
Voters rank all candidates. The candidate with the fewest first-choice votes is eliminated, and their votes transfer to each voter's next choice. This repeats until one candidate has a majority.

### Borda Count
Voters rank all candidates. Points are awarded based on position: with N candidates, first place gets N-1 points, second gets N-2, etc. The candidate with the most total points wins.

### Condorcet
The winner is the candidate who would beat every other candidate in a head-to-head matchup. If no such candidate exists (a Condorcet cycle), the method falls back to IRV.

### Smith Set + Approval
First, compute the Smith Set—the smallest set of candidates who beat all candidates outside the set in head-to-head matchups. Then, among only those candidates, the one with the most approval votes wins.

## Interpreting the Diagrams

### Comparing Methods
When viewing all six methods side by side, look for:
- **Areas where methods agree**: All diagrams show the same color—these are "safe" regions where the winner is unambiguous
- **Areas where methods disagree**: Different colors appear—these reveal how voting methods can produce different outcomes from the same voter preferences
- **Boundary shapes**: Plurality tends to have simpler boundaries; ranked methods like IRV and Condorcet can have more complex shapes

### What Shapes Mean
- **Convex regions around candidates**: The method respects spatial proximity well
- **Non-convex or fragmented regions**: The method may have strategic voting concerns or spoiler effects
- **One candidate dominating**: That candidate is positioned closest to the voter population's center of mass

### Pathological Cases to Look For
- **Center squeeze**: A centrist candidate loses despite being many voters' second choice (common in Plurality and IRV)
- **Spoiler effect**: Adding a candidate changes which of the existing candidates wins (common in Plurality)
- **Monotonicity failures**: Moving a candidate closer to a voter region causes them to lose (can happen in IRV)

## Controls

- **Drag candidates** on any diagram to reposition them—all diagrams update together
- **Click anywhere** to open the Ballot Inspector and see exactly how voters at that location would vote
- **Approval Threshold**: Adjusts how close a candidate must be for voters to approve them (affects Approval and Smith+Approval methods)
- **Resolution**: Higher values give more detail but take longer to compute
- **Candidate management**: Add up to 8 candidates or remove down to 2
- **Candidate Positions**: Enter exact coordinates (0-1 range) for precise positioning

## Technical Notes

- Coordinates are normalized to [0, 1] on both axes
- The voter sampling radius is fixed at 0.12 regardless of resolution
- If fewer than 3 voters are found near a point, the diagram falls back to showing the closest candidate (Voronoi regions)
- Voter positions are generated fresh on page load using normal distributions around configured bloc centers
