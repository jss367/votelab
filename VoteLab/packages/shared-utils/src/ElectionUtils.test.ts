import { Election } from '../types';
import { calculateSmithSet, getHeadToHeadVictories, getPairwiseResults } from './ElectionUtils';

describe('Election Result Calculations', () => {
  // Simple test case with clear winner
  const simpleTestElection: Election = {
    title: "Test Election",
    candidates: [
      { id: "1", name: "Candidate 1" },
      { id: "2", name: "Candidate 2" },
      { id: "3", name: "Candidate 3" }
    ],
    votes: [
      // 3 votes preferring: Candidate 1 > Candidate 2 > Candidate 3
      {
        voterName: "Voter A",
        ranking: ["1", "2", "3"],
        approved: ["1"],
        timestamp: new Date().toISOString()
      },
      {
        voterName: "Voter B",
        ranking: ["1", "2", "3"],
        approved: ["1"],
        timestamp: new Date().toISOString()
      },
      {
        voterName: "Voter C",
        ranking: ["1", "2", "3"],
        approved: ["1"],
        timestamp: new Date().toISOString()
      },
      // 2 votes preferring: Candidate 3 > Candidate 1 > Candidate 2
      {
        voterName: "Voter D",
        ranking: ["3", "1", "2"],
        approved: ["3"],
        timestamp: new Date().toISOString()
      },
      {
        voterName: "Voter E",
        ranking: ["3", "1", "2"],
        approved: ["3"],
        timestamp: new Date().toISOString()
      },
    ],
    createdAt: new Date().toISOString()
  };

  test('generates correct pairwise results for three candidates', () => {
    const results = getPairwiseResults(simpleTestElection);

    // Log results for debugging
    console.log('Pairwise Results:', JSON.stringify(results, null, 2));

    expect(results).toEqual([
      {
        candidate1: "Candidate 1",
        candidate2: "Candidate 2",
        candidate1Votes: 5,  // 3 direct votes + 2 from Candidate 3 voters
        candidate2Votes: 0   // No direct wins
      },
      {
        candidate1: "Candidate 1",
        candidate2: "Candidate 3",
        candidate1Votes: 3,  // 3 direct votes
        candidate2Votes: 2   // 2 direct votes
      },
      {
        candidate1: "Candidate 2",
        candidate2: "Candidate 3",
        candidate1Votes: 3,  // Gets votes from Candidate 1 voters
        candidate2Votes: 2   // 2 direct votes
      }
    ]);
  });

  test('calculates head-to-head victories correctly', () => {
    const pairwise = getPairwiseResults(simpleTestElection);
    const victories = getHeadToHeadVictories(pairwise);

    // Log victories for debugging
    console.log('Victories:', JSON.stringify(victories, null, 2));

    expect(victories).toEqual([
      {
        winner: "Candidate 1",
        loser: "Candidate 2",
        margin: 5  // Won 5-0
      },
      {
        winner: "Candidate 1",
        loser: "Candidate 3",
        margin: 1  // Won 3-2
      },
      {
        winner: "Candidate 2",
        loser: "Candidate 3",
        margin: 1  // Won 3-2
      }
    ]);
  });

  test('identifies correct Smith set with clear winner', () => {
    const pairwise = getPairwiseResults(simpleTestElection);
    const victories = getHeadToHeadVictories(pairwise);
    const smithSet = calculateSmithSet(victories, simpleTestElection);

    expect(smithSet).toEqual(["Candidate 1"]); // Candidate 1 beats everyone
  });

  // Test case for cyclic preferences (Rock-Paper-Scissors scenario)
  const cyclicElection: Election = {
    title: "Cyclic Test",
    candidates: [
      { id: "1", name: "Rock" },
      { id: "2", name: "Paper" },
      { id: "3", name: "Scissors" }
    ],
    votes: [
      // Rock beats Scissors
      {
        voterName: "Voter A",
        ranking: ["1", "3", "2"],
        approved: ["1"],
        timestamp: new Date().toISOString()
      },
      // Paper beats Rock
      {
        voterName: "Voter B",
        ranking: ["2", "1", "3"],
        approved: ["2"],
        timestamp: new Date().toISOString()
      },
      // Scissors beats Paper
      {
        voterName: "Voter C",
        ranking: ["3", "2", "1"],
        approved: ["3"],
        timestamp: new Date().toISOString()
      }
    ],
    createdAt: new Date().toISOString()
  };

  test('handles cyclic preferences correctly', () => {
    const pairwise = getPairwiseResults(cyclicElection);
    console.log('Cyclic Pairwise Results:', JSON.stringify(pairwise, null, 2));

    const victories = getHeadToHeadVictories(pairwise);
    console.log('Cyclic Victories:', JSON.stringify(victories, null, 2));

    const smithSet = calculateSmithSet(victories, cyclicElection);
    console.log('Cyclic Smith Set:', smithSet);

    // In a perfect cycle, all candidates should be in the Smith set
    expect(new Set(smithSet)).toEqual(new Set(["Rock", "Paper", "Scissors"]));
  });

  // Test edge case with tied preferences
  const tiedElection: Election = {
    title: "Tied Test",
    candidates: [
      { id: "1", name: "Candidate 1" },
      { id: "2", name: "Candidate 2" }
    ],
    votes: [
      {
        voterName: "Voter A",
        ranking: ["1", "2"],
        approved: ["1"],
        timestamp: new Date().toISOString()
      },
      {
        voterName: "Voter B",
        ranking: ["2", "1"],
        approved: ["2"],
        timestamp: new Date().toISOString()
      }
    ],
    createdAt: new Date().toISOString()
  };

  test('handles tied preferences correctly', () => {
    const pairwise = getPairwiseResults(tiedElection);
    const victories = getHeadToHeadVictories(pairwise);
    const smithSet = calculateSmithSet(victories, tiedElection);

    // With perfect ties, both candidates should be in Smith set
    expect(new Set(smithSet)).toEqual(new Set(["Candidate 1", "Candidate 2"]));
  });
});
