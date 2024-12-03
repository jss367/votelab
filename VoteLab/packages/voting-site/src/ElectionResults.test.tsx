import { Election } from './types';
import { calculateSmithSet, getHeadToHeadVictories, getPairwiseResults } from './utils/ElectionUtils';

describe('Election Result Calculations', () => {
    const threeWayTestElection: Election = {
        title: "Test Election",
        candidates: [
            { id: "1", name: "Candidate 1" },
            { id: "2", name: "Candidate 2" },
            { id: "3", name: "Candidate 3" }
        ],
        votes: [
            // Candidate 1 > 2 > 3
            {
                voterName: "Voter 1",
                ranking: ["1", "2", "3"],
                approved: ["1"],
                timestamp: new Date().toISOString()
            },
            {
                voterName: "Voter 2",
                ranking: ["1", "2", "3"],
                approved: ["1"],
                timestamp: new Date().toISOString()
            },
            // Candidate 2 > 3 > 1
            {
                voterName: "Voter 3",
                ranking: ["2", "3", "1"],
                approved: ["2"],
                timestamp: new Date().toISOString()
            },
            // Candidate 3 > 1 > 2
            {
                voterName: "Voter 4",
                ranking: ["3", "1", "2"],
                approved: ["3"],
                timestamp: new Date().toISOString()
            }
        ],
        createdAt: new Date().toISOString()
    };

    test('generates correct pairwise results for three candidates', () => {
        const results = getPairwiseResults(threeWayTestElection);

        expect(results).toEqual([
            {
                candidate1: "Candidate 1",
                candidate2: "Candidate 2",
                candidate1Votes: 3,
                candidate2Votes: 1
            },
            {
                candidate1: "Candidate 1",
                candidate2: "Candidate 3",
                candidate1Votes: 2,
                candidate2Votes: 2
            },
            {
                candidate1: "Candidate 2",
                candidate2: "Candidate 3",
                candidate1Votes: 3,
                candidate2Votes: 1
            }
        ]);
    });

    test('calculates head-to-head victories correctly', () => {
        const pairwise = getPairwiseResults(threeWayTestElection);
        const victories = getHeadToHeadVictories(pairwise);

        expect(victories).toEqual([
            {
                winner: "Candidate 1",
                loser: "Candidate 2",
                margin: 2
            },
            {
                winner: "Candidate 2",
                loser: "Candidate 3",
                margin: 2
            }
        ]);
    });

    test('identifies correct Smith set with mixed victories and ties', () => {
        const pairwise = getPairwiseResults(threeWayTestElection);
        console.log('Pairwise Results:', JSON.stringify(pairwise, null, 2));

        const victories = getHeadToHeadVictories(pairwise);
        console.log('Victories:', JSON.stringify(victories, null, 2));

        const smithSet = calculateSmithSet(victories, threeWayTestElection);

        // Candidate 1 should be the only member of the Smith set because:
        // - Beats Candidate 2 (3-1)
        // - Ties with Candidate 3 (2-2)
        // - Candidate 2 is excluded because they lose to Candidate 1
        // - Candidate 3 is excluded because they lose to Candidate 2
        expect(new Set(smithSet)).toEqual(new Set(["Candidate 1"]));
    });
});