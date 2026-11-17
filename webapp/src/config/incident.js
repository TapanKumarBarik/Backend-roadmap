// The earlier days in the Daily Incident dialog (components/incident/DailyIncidentModal.jsx): the list of the incidents of the days before, and the way back to today's.
export const INCIDENT = {
  archive: {
    heading: 'Earlier incidents',
    lead: 'Missed a day? These are the incidents of the days before. Solving one counts as a day you showed up.',
    viewing: (day) => `You are looking at the incident of ${day}.`,
    backToToday: "Back to today's incident",
    state: { solved: 'Solved', missed: 'Missed the root cause', notTried: 'Not tried' }
  }
};
