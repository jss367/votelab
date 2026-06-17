import ElectionsClient from './ElectionsClient';

export const metadata = {
  title: 'Run Elections — VoteLab',
  description:
    'Create a poll, gather ballots, and see results across voting methods.',
};

export default function ElectionsPage() {
  return <ElectionsClient />;
}
