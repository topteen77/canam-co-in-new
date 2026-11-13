export function callStatusLabel(outcome?: string | null): string {
  switch (outcome) {
    case 'answered': return 'Answered';
    case 'no-ring': return '';
    case 'agent-no-answer': return 'Agent did not pick up';
    case 'customer-no-answer': return 'Customer did not pick up';
    case 'no-answer': return 'Not answered';
    case 'busy': return 'Busy';
    case 'voicemail': return 'Voicemail';
    case 'failed': return 'Call failed';
    default: return 'Other';
  }
}
