/**
 * ahrefs backlinks — stub. Strategy locked in Task 2; implementation in Task 3.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'ahrefs',
  name: 'backlinks',
  access: 'read',
  description: 'Check Ahrefs free Backlink Checker (DR + backlinks, mode=subdomains)',
  strategy: Strategy.UI,
  browser: true,
  domain: 'ahrefs.com',
  args: [
    {
      name: 'domain',
      type: 'string',
      required: true,
      positional: true,
      help: 'Target domain (e.g. ahrefs.com)',
    },
  ],
  columns: ['summary', 'links'],
  func: async () => {
    throw new Error('ahrefs backlinks not implemented yet');
  },
});
