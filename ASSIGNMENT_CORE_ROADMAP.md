# Assignment Core Roadmap

## Game-centered assignment workflow

The Assignment Core should use each game as the primary assignment workspace, following the practical strengths of the former GameOfficials model without copying its interface.

### Dedicated game page

Selecting a game from the schedule or assignment board opens a dedicated page with:

- Editable game details, including date, time, venue, field, competition, teams, and game status.
- Configurable crew requirements and position slots.
- Assigned, open, draft, published, accepted, declined, and no-response positions.
- Position-specific eligibility, prerequisites, and restrictions.
- Assignment history and an audit trail of every change.
- Applicable Rules of Competition and other game documents.
- Relevant check-in, rating, coaching, and game-report information.

### Crew and mentor assignments

The game page must support adding, replacing, removing, drafting, and publishing officials by position. Alongside the normal referee crew, authorized staff can add a Referee Mentor or Referee Coach assignment linked directly to the game.

Mentor/coach assignments should integrate with:

- Coach schedule visibility.
- Check-in expectations.
- Rating and development tools.
- Event- and game-level access controls.
- Notifications when the assignment is published.

### Inline schedule assignment

Authorized assignors and administrators can also make or change referee assignments directly within the schedule’s game list without opening the full game page. Inline editing is intended for rapid staffing work, while the dedicated game page provides complete configuration and history.

Both interfaces must use the same assignment records, authorization rules, draft/publish state, validation, conflict detection, acceptance status, and audit logging.

### Assignment publication

Publishing should be position-specific when configured. An assignor may publish selected members of a crew while leaving other positions in draft. Published assignments trigger the configured notification and acceptance workflow; draft assignments remain invisible to the affected officials.
