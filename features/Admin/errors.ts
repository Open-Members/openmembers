export class AdminOverviewReadError extends Error {
  constructor() {
    super('ADMIN_OVERVIEW_READ_FAILED');
    this.name = 'AdminOverviewReadError';
  }
}
