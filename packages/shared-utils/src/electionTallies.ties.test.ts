import { describe, expect, it } from 'vitest';
import {
  tallyApproval,
  tallyBorda,
  tallyCumulative,
  tallyIRV,
  tallyMajorityJudgment,
  tallyPlurality,
  tallyRankedPairs,
  tallyRRV,
  tallyScore,
  tallySTV,
  tallyStar,
} from './electionTallies.js';
import type { Candidate, Vote } from './types.js';

const candidates: Candidate[] = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
  { id: 'c', name: 'Charlie' },
];

const ranked = (...ranking: string[]): Vote => ({
  voterName: 'v',
  ranking,
  approved: [],
  timestamp: '',
});
const approving = (...approved: string[]): Vote => ({
  voterName: 'v',
  ranking: [],
  approved,
  timestamp: '',
});
const scored = (scores: Record<string, number>): Vote => ({
  voterName: 'v',
  ranking: [],
  approved: [],
  scores,
  timestamp: '',
});

describe('tie reporting', () => {
  it('plurality reports a tie for first and none for a clear win', () => {
    const tie = tallyPlurality([ranked('a'), ranked('b'), ranked('c', 'a')], candidates);
    expect(tie.tied).toEqual(['a', 'b', 'c']);
    expect(tie.winner).toBe('a');

    const clear = tallyPlurality([ranked('a'), ranked('a'), ranked('b')], candidates);
    expect(clear.tied).toEqual([]);
  });

  it('approval reports only the candidates tied for first', () => {
    const result = tallyApproval(
      [approving('a', 'b'), approving('a', 'b'), approving('c')],
      candidates
    );
    expect(result.tied).toEqual(['a', 'b']);
  });

  it('borda and score report ties for first', () => {
    expect(tallyBorda([ranked('a', 'b', 'c'), ranked('b', 'a', 'c')], candidates).tied).toEqual([
      'a',
      'b',
    ]);
    expect(
      tallyScore([scored({ a: 5, b: 3 }), scored({ a: 3, b: 5 })], candidates).tied
    ).toEqual(['a', 'b']);
  });

  it('IRV reports an elimination tie in the round and a final-two tie on the result', () => {
    // Round 1: c is last alone. Round 2: a and b are tied 2-2.
    const votes = [ranked('a'), ranked('a'), ranked('b'), ranked('b')];
    const result = tallyIRV(votes, candidates);
    expect(result.rounds[0].tied).toEqual([]);
    expect(result.rounds[1].tied).toEqual(['a', 'b']);
    expect(result.tied).toEqual(['a', 'b']);
  });

  it('IRV reports a tie for last without flagging the final result', () => {
    // No majority in round 1 (a has 2 of 4) and b and c tie for last; a then
    // has a majority in round 2.
    const votes = [ranked('a'), ranked('a'), ranked('b', 'a'), ranked('c', 'a')];
    const result = tallyIRV(votes, candidates);
    expect(result.rounds[0].tied).toEqual(['b', 'c']);
    expect(result.tied).toEqual([]);
  });

  it('STV reports an elimination tie', () => {
    const votes = [ranked('a'), ranked('a'), ranked('b', 'a'), ranked('c', 'a')];
    const result = tallySTV(votes, candidates, 1);
    const elimination = result.rounds.find((r) => r.eliminated);
    expect(elimination?.tied).toEqual(['b', 'c']);
  });

  it('RRV reports a tie for a round seat', () => {
    const result = tallyRRV([scored({ a: 10, b: 10, c: 0 })], candidates, 1);
    expect(result.rounds[0].tied).toEqual(['a', 'b']);
  });

  it('STAR reports a finalist tie and a true runoff tie', () => {
    const finalistTie = tallyStar(
      [scored({ a: 5, b: 3, c: 3 }), scored({ a: 5, b: 3, c: 3 })],
      candidates
    );
    expect(finalistTie.finalistTie).toEqual(['b', 'c']);

    // a and b split the runoff 1-1 and have equal total scores.
    const runoffTie = tallyStar([scored({ a: 5, b: 0 }), scored({ a: 0, b: 5 })], candidates);
    expect(runoffTie.tied).toEqual(['a', 'b']);
  });

  it('STAR does not report a tie when the higher total score breaks the runoff tie', () => {
    // Runoff is 1-1, but a outscores b 5 to 4.
    const result = tallyStar([scored({ a: 5, b: 3 }), scored({ a: 0, b: 1 })], candidates);
    expect(result.winner).toBe('a');
    expect(result.tied).toEqual([]);
  });

  it('ranked pairs reports multiple unbeaten candidates', () => {
    // a and b tie head-to-head; both beat c.
    const result = tallyRankedPairs([ranked('a', 'b', 'c'), ranked('b', 'a', 'c')], candidates);
    expect(result.tied).toEqual(['a', 'b']);
  });

  it('ranked pairs discloses an equal-margin cycle for every candidate order', () => {
    const votes = [ranked('a', 'b', 'c'), ranked('b', 'c', 'a'), ranked('c', 'a', 'b')];
    const orders = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ];
    const winners = new Set<string>();
    for (const order of orders) {
      const result = tallyRankedPairs(votes, order.map((i) => candidates[i]));
      winners.add(result.winner);
      expect(result.tied).toEqual([]);
      expect(result.lockingTies).toHaveLength(1);
      expect(result.lockingTies[0].margin).toBe(1);
      expect(result.lockingTies[0].pairs).toHaveLength(3);
      expect(result.lockingTies[0].pairs).toEqual(expect.arrayContaining([
        { winner: 'a', loser: 'b' },
        { winner: 'b', loser: 'c' },
        { winner: 'c', loser: 'a' },
      ]));
    }
    expect(winners.size).toBe(3);
  });

  it('ranked pairs does not flag equal margins that can all be locked', () => {
    const result = tallyRankedPairs([ranked('a', 'b', 'c')], candidates);
    expect(result.winner).toBe('a');
    expect(result.lockingTies).toEqual([]);
  });

  // Each pair of ballots contributes +2 to just the requested matchup;
  // their other pairwise preferences cancel.
  const marginVotes = (edges: Array<[string, string, number]>, ids: string[]) =>
    edges.flatMap(([winner, loser, margin]) => {
      const rest = ids.filter((id) => id !== winner && id !== loser);
      return Array.from({ length: margin / 2 }, () => [
        ranked(winner, loser, ...rest),
        ranked(...[...rest].reverse(), winner, loser),
      ]).flat();
    });

  it('ranked pairs detects tied locks in a cycle that includes a stronger victory', () => {
    const votes = marginVotes([['a', 'b', 4], ['b', 'c', 2], ['c', 'a', 2]], ['a', 'b', 'c']);
    const result = tallyRankedPairs(votes, candidates);
    expect(result.lockingTies).toEqual([{
      margin: 2,
      pairs: [{ winner: 'b', loser: 'c' }, { winner: 'c', loser: 'a' }],
    }]);
  });

  it('ranked pairs excludes victories already blocked by stronger locked pairs', () => {
    const four = [...candidates, { id: 'd', name: 'Dana' }];
    const votes = marginVotes(
      [['a', 'b', 6], ['b', 'c', 4], ['c', 'a', 2], ['c', 'd', 2]],
      four.map((candidate) => candidate.id)
    );
    const result = tallyRankedPairs(votes, four);
    expect(result.winner).toBe('a');
    expect(result.lockingTies).toEqual([]);
  });

  it('majority judgment reports identical grade profiles', () => {
    const result = tallyMajorityJudgment(
      [scored({ a: 4, b: 4, c: 1 }), scored({ a: 2, b: 2, c: 1 })],
      candidates
    );
    expect(result.tied).toEqual(['a', 'b']);
  });

  it('cumulative reports a tie for the last seat only', () => {
    const lastSeat = tallyCumulative([scored({ a: 5, b: 2, c: 2 })], candidates, 2);
    expect(lastSeat.tied).toEqual(['b', 'c']);

    // a and b tie, but both get a seat.
    const bothSeated = tallyCumulative([scored({ a: 4, b: 4, c: 1 })], candidates, 2);
    expect(bothSeated.tied).toEqual([]);
  });
});
