# Direct reservations — local implementation

Enabled venues: Embassy Vasant Kunj, Embassy Elan Epic, Basque and Kampai. Embassy Connaught Place remains available for existing lead entry only.

## Guest and staff journey

1. `/reserve?venue=basque&source=google` opens the guest request form. Other venue values: `embassy-vk`, `embassy-elan`, `kampai`.
2. The guest receives a pending request with a private status link. Submission does not promise a table. Staff must contact the guest manually; automated SMS/WhatsApp is not implemented.
3. Staff sign in using the existing company account. Reservations appear in the admin dashboard and the leads entry screen.
4. On the leads screen, select the correct restaurant, enter the phone number and press Check. Today's matching reservations open in a popup, including requests the manager has not yet confirmed.
5. For a pending request, the hostess chooses Confirm and mark arrived, checks seating availability, enters actual arriving party size and saves. Confirmation and arrival are committed together. If the operation fails, neither step is saved.
6. Arrival creates one linked lead. Do not submit a second walk-in entry for the same booking. Assigning a table updates that linked lead. Confirmation alone does not create a lead.

## Cases verified by automated tests

- Repeating the same booking request returns the original booking.
- Pending arrival without a capacity check is rejected.
- Another company's account cannot update the booking.
- Concurrent arrivals create one visit; the losing operation receives a refresh conflict.
- Booked pax is preserved separately from actual pax.
- Gate confirmation and arrival both appear in history.
- Table assignment updates the existing linked lead.
- Cancelled bookings cannot check in.
- Another day's booking cannot check in, and a failed action leaves history unchanged.
- Embassy CP is excluded from public reservations.

## Remaining rollout work

This is local code, not an activated Google integration. Production PostgreSQL, deployment, Google booking links and provider settings still require verification. Google may display third-party Reserve buttons independently of a custom booking link.

Capacity is checked by staff, not automatically calculated from tables or time slots. Existing company logins identify the company in history, not individual hostesses/managers. Staff role separation, automated notifications, partial-group tracking, rescheduling and wait-list policies are not implemented. Arrival leads are stored in WalkinLeads; automatic Google Sheets synchronization on reservation arrival is not implemented (the existing manual bulk sync can export them). Petpooja integration is not implemented.

Browser verification reached guest submission and the pending reservation popup through phone lookup. The browser connection stalled during the arrival interaction; the subsequent inline action controls still need a completed browser verification. Store-level arrival and concurrency tests pass.
