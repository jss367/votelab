export type DistrictingResolution = 'tracts' | 'block-groups';

export interface DistrictingStateMetadata {
  id: string;
  name: string;
  fips: string;
  defaultDistricts: number;
  datasets: Partial<Record<DistrictingResolution, string>>;
}

const STATES: Array<{
  id: string;
  name: string;
  fips: string;
  districts: number;
  blockGroups?: boolean;
}> = [
  { id: 'alabama', name: 'Alabama', fips: '01', districts: 7 },
  { id: 'alaska', name: 'Alaska', fips: '02', districts: 1 },
  { id: 'arizona', name: 'Arizona', fips: '04', districts: 9 },
  { id: 'arkansas', name: 'Arkansas', fips: '05', districts: 4 },
  { id: 'california', name: 'California', fips: '06', districts: 52 },
  { id: 'colorado', name: 'Colorado', fips: '08', districts: 8 },
  { id: 'connecticut', name: 'Connecticut', fips: '09', districts: 5 },
  { id: 'delaware', name: 'Delaware', fips: '10', districts: 1, blockGroups: true },
  { id: 'florida', name: 'Florida', fips: '12', districts: 28 },
  { id: 'georgia', name: 'Georgia', fips: '13', districts: 14 },
  { id: 'hawaii', name: 'Hawaii', fips: '15', districts: 2 },
  { id: 'idaho', name: 'Idaho', fips: '16', districts: 2 },
  { id: 'illinois', name: 'Illinois', fips: '17', districts: 17 },
  { id: 'indiana', name: 'Indiana', fips: '18', districts: 9 },
  { id: 'iowa', name: 'Iowa', fips: '19', districts: 4 },
  { id: 'kansas', name: 'Kansas', fips: '20', districts: 4 },
  { id: 'kentucky', name: 'Kentucky', fips: '21', districts: 6 },
  { id: 'louisiana', name: 'Louisiana', fips: '22', districts: 6 },
  { id: 'maine', name: 'Maine', fips: '23', districts: 2 },
  { id: 'maryland', name: 'Maryland', fips: '24', districts: 8 },
  { id: 'massachusetts', name: 'Massachusetts', fips: '25', districts: 9 },
  { id: 'michigan', name: 'Michigan', fips: '26', districts: 13 },
  { id: 'minnesota', name: 'Minnesota', fips: '27', districts: 8 },
  { id: 'mississippi', name: 'Mississippi', fips: '28', districts: 4 },
  { id: 'missouri', name: 'Missouri', fips: '29', districts: 8 },
  { id: 'montana', name: 'Montana', fips: '30', districts: 2 },
  { id: 'nebraska', name: 'Nebraska', fips: '31', districts: 3 },
  { id: 'nevada', name: 'Nevada', fips: '32', districts: 4 },
  {
    id: 'new-hampshire',
    name: 'New Hampshire',
    fips: '33',
    districts: 2,
    blockGroups: true,
  },
  { id: 'new-jersey', name: 'New Jersey', fips: '34', districts: 12 },
  { id: 'new-mexico', name: 'New Mexico', fips: '35', districts: 3 },
  { id: 'new-york', name: 'New York', fips: '36', districts: 26 },
  { id: 'north-carolina', name: 'North Carolina', fips: '37', districts: 14 },
  { id: 'north-dakota', name: 'North Dakota', fips: '38', districts: 1 },
  { id: 'ohio', name: 'Ohio', fips: '39', districts: 15 },
  { id: 'oklahoma', name: 'Oklahoma', fips: '40', districts: 5 },
  { id: 'oregon', name: 'Oregon', fips: '41', districts: 6 },
  { id: 'pennsylvania', name: 'Pennsylvania', fips: '42', districts: 17 },
  {
    id: 'rhode-island',
    name: 'Rhode Island',
    fips: '44',
    districts: 2,
    blockGroups: true,
  },
  { id: 'south-carolina', name: 'South Carolina', fips: '45', districts: 7 },
  { id: 'south-dakota', name: 'South Dakota', fips: '46', districts: 1 },
  { id: 'tennessee', name: 'Tennessee', fips: '47', districts: 9 },
  { id: 'texas', name: 'Texas', fips: '48', districts: 38 },
  { id: 'utah', name: 'Utah', fips: '49', districts: 4 },
  { id: 'vermont', name: 'Vermont', fips: '50', districts: 1 },
  { id: 'virginia', name: 'Virginia', fips: '51', districts: 11 },
  { id: 'washington', name: 'Washington', fips: '53', districts: 10 },
  { id: 'west-virginia', name: 'West Virginia', fips: '54', districts: 2 },
  { id: 'wisconsin', name: 'Wisconsin', fips: '55', districts: 8 },
  { id: 'wyoming', name: 'Wyoming', fips: '56', districts: 1 },
];

export const DISTRICTING_STATES: DistrictingStateMetadata[] = STATES.map(
  (state) => ({
    id: state.id,
    name: state.name,
    fips: state.fips,
    defaultDistricts: state.districts,
    datasets: {
      tracts: `/data/districting/${state.id}-tracts.json`,
      ...(state.blockGroups
        ? {
            'block-groups': `/data/districting/${state.id}-block-groups.json`,
          }
        : {}),
    },
  })
);

export const DISTRICTING_RESOLUTIONS: {
  id: DistrictingResolution;
  label: string;
}[] = [
  { id: 'block-groups', label: 'Block groups' },
  { id: 'tracts', label: 'Tracts' },
];
