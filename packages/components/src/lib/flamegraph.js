import { formatNumberExponential, formatNumberMetric } from './metric';

export const add = (x, y) => x + y;

//////////////
// Duration //
//////////////

export const isEventDurationValid = ({ elapsedTime }) =>
  typeof elapsedTime === 'number' && elapsedTime >= 0;

export const getEventDuration = (event) => (isEventDurationValid(event) ? event.elapsedTime : 0);

//////////////
// Duration //
//////////////

export const formatDurationMillisecond = (duration, precision) => {
  if (duration > 0) {
    return `${formatNumberExponential(1e3 * duration, precision)} ms`;
  } else {
    return 'unknown';
  }
};

export const formatDuration = (duration, precision) => {
  if (duration > 0) {
    return `${formatNumberMetric(duration, precision)}s`;
  } else {
    return 'unknown';
  }
};

// This was the original implementation of budgeting. It was inlined into the flamegraph components
// to improve performance by letting vue not recomputing needless stuff on property change.

// export const budgetDuration = (duration, total, budget) =>
//   Math.min(budget, Math.floor(budget * (duration / total)));

// export const budgetEvent = (event, total, budget) =>
//   budgetDuration(getEventDuration(event), total, budget);

// export const budgetEventArray = (events, total, budget) =>
//   budgetDuration(events.map(getEventDuration).reduce(add, 0), total, budget);

// export const budgetEventChildren = (event, budget) => {
//   const duration = getEventDuration(event);
//   if (duration === 0) {
//     return budget;
//   } else {
//     return budgetEventArray(event.children, duration, budget);
//   }
// };

// export const compileBudgetEvent = (focus, events, budget) => {
//   if (focus) {
//     const ancestors = new Set(focus.ancestors());
//     ancestors.add(focus);
//     return (event) => (ancestors.has(event) ? budget : 0);
//   } else {
//     const total = events.map(getEventDuration).reduce(add, 0);
//     if (total === 0) {
//       const default_budget = Math.floor(budget / events.length);
//       return (_event) => default_budget;
//     } else {
//       const valid_event_count = events.filter(isEventDurationValid).length;
//       const invalid_event_count = events.length - valid_event_count;
//       const valid_budget = Math.floor((budget * valid_event_count) / events.length);
//       const invalid_budget = Math.floor((budget * invalid_event_count) / events.length);
//       const default_invalid_budget = Math.floor(
//         (invalid_budget * invalid_event_count) / events.length
//       );
//       return (event) =>
//         isEventDurationValid(event)
//           ? budgetEvent(event, total, valid_budget)
//           : default_invalid_budget;
//     }
//   }
// };
