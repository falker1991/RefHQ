# Law18Ref email templates

## Official account invitation

Subject:

`You’re invited to join {{organization_name}} on Law18Ref`

Templates:

- `official-account-invitation.html` — responsive branded HTML email
- `official-account-invitation.txt` — plain-text fallback

Required template values:

| Value | Purpose |
| --- | --- |
| `{{official_first_name}}` | Recipient’s first or preferred name |
| `{{organization_name}}` | Organization inviting the official |
| `{{inviter_name}}` | Administrator who initiated the invitation |
| `{{invitation_url}}` | Single-use, expiring account-creation link |
| `{{invitation_expiration}}` | Human-readable expiration date and time |
| `{{site_url}}` | Public Law18Ref address |
| `{{support_email}}` | Monitored support address |

The invitation link must be single-use, expire automatically, and be invalidated when an administrator replaces the recipient email or revokes the invitation. Do not include passwords, birth dates, claim codes, or other sensitive account data in email.
