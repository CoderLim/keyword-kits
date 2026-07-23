/**
 * ahrefs kd — stub. Strategy locked in Task 3; implementation in Task 4.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'ahrefs',
  name: 'kd',
  access: 'read',
  description: 'Check Ahrefs Keyword Difficulty (free tool)',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    {
      name: 'keyword',
      type: 'string',
      required: true,
      positional: true,
      help: 'Keyword or phrase to check',
    },
    {
      name: 'country',
      type: 'string',
      default: 'us',
      help: 'Two-letter country code (default us)',
    },
  ],
  columns: ['keyword', 'country', 'kd'],
  func: async () => {
    throw new Error('ahrefs kd not implemented yet');
  },
});
