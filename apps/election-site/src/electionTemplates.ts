import { CustomField } from './types';

export interface ElectionTemplate {
  name: string;
  candidateLabel: string;
  fields: Omit<CustomField, 'id'>[];
}

export const electionTemplates: ElectionTemplate[] = [
  {
    name: 'Book Club',
    candidateLabel: 'Book Title',
    fields: [
      { name: 'Author', type: 'text', required: true },
      {
        name: 'Genre',
        type: 'select',
        required: false,
        options: ['Fiction', 'Non-fiction', 'Sci-Fi', 'Fantasy', 'Mystery', 'Romance', 'Historical'],
      },
      { name: 'Page Count', type: 'number', required: false },
      { name: 'Submitted by', type: 'text', required: false },
      { name: 'Your Pitch', type: 'textarea', required: false },
    ],
  },
  {
    name: 'Movie Night',
    candidateLabel: 'Movie Title',
    fields: [
      { name: 'Director', type: 'text', required: false },
      {
        name: 'Genre',
        type: 'multiselect',
        required: false,
        options: ['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Romance', 'Documentary', 'Thriller'],
      },
      { name: 'Year', type: 'number', required: false },
      { name: 'Submitted by', type: 'text', required: false },
      { name: 'Your Pitch', type: 'textarea', required: false },
    ],
  },
  {
    name: 'Restaurant Pick',
    candidateLabel: 'Restaurant Name',
    fields: [
      {
        name: 'Cuisine',
        type: 'select',
        required: false,
        options: ['Italian', 'Mexican', 'Chinese', 'Japanese', 'Thai', 'Indian', 'American', 'Mediterranean'],
      },
      {
        name: 'Price Range',
        type: 'select',
        required: false,
        options: ['$', '$$', '$$$', '$$$$'],
      },
      { name: 'Location', type: 'text', required: false },
      { name: 'Submitted by', type: 'text', required: false },
      { name: 'Your Pitch', type: 'textarea', required: false },
    ],
  },
  {
    name: 'Hackathon Project',
    candidateLabel: 'Project Name',
    fields: [
      { name: 'Team', type: 'text', required: true },
      {
        name: 'Tech Stack',
        type: 'multiselect',
        required: false,
        options: ['JavaScript', 'Python', 'Rust', 'Go', 'React', 'Node.js', 'AI/ML'],
      },
      { name: 'Description', type: 'textarea', required: false },
      { name: 'Submitted by', type: 'text', required: false },
      { name: 'Your Pitch', type: 'textarea', required: false },
    ],
  },
  {
    name: 'Game Night',
    candidateLabel: 'Game Name',
    fields: [
      { name: 'Player Count', type: 'text', required: false },
      {
        name: 'Genre',
        type: 'select',
        required: false,
        options: ['Strategy', 'Party', 'Cooperative', 'Card', 'Board', 'Video'],
      },
      { name: 'Play Time', type: 'text', required: false },
      { name: 'Submitted by', type: 'text', required: false },
      { name: 'Your Pitch', type: 'textarea', required: false },
    ],
  },
];
