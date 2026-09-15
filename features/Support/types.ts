export type SupportTicketStatus = 'open' | 'in_progress' | 'closed';

export interface SupportTicketRow {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminSupportTicketRow extends SupportTicketRow {
  user: {
    id: string;
    display_name: string | null;
  } | null;
}
