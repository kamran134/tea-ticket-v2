export function startCronJobs(): void {
  // Auto-expiring BOOKED tickets after 1 hour assumed the buyer would pay
  // and upload a receipt within that window (BOOKED -> PENDING). With the
  // online payment step stubbed out until acquiring is connected, admins
  // confirm bookings manually and there's no more "unpaid" signal to expire
  // on — so this job is disabled for now. Re-enable once real payment (and
  // its own timeout policy) is back.
}
