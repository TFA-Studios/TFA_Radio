// One place that decides how a brief's script stage and production stage are
// shown in the overview. Deliberately separate from the editable workflow
// `status` (To-do / Wacht op klant / ...): the script column answers "where is
// the script", the production column answers "where is the production", and
// the status column stays the producer's own to-do state. Pure functions so
// they can be tested and reused (table, modal) without duplicating the rules.
import { scriptCheckState } from './flowData.js';

// tone: 'neutral' (nothing to do), 'ok' (done), 'attention' (needs TFA).
// rank is used for sorting: higher = needs more attention / is further along.
export function scriptIndicator(brief) {
  if (!brief || !brief.submittedAt) return { tone: 'neutral', icon: 'dash', label: 'Brief open', title: 'De klant heeft de brief nog niet verstuurd', rank: 0 };
  const check = scriptCheckState(brief);
  if (check === 'pending') return { tone: 'attention', icon: 'alert', label: 'Controleren', title: 'De klant paste het script aan: nog controleren', rank: 6 };
  if (check === 'nofit') return { tone: 'attention', icon: 'alert', label: 'Past niet', title: 'De klant zegt dat geen van de voorstellen past', rank: 5 };
  if (check === 'counter') return { tone: 'neutral', icon: 'clock', label: 'Wacht op klant', title: 'Tegenvoorstel verstuurd, wacht op de klant', rank: 3 };
  if (brief.finalizedAt) return { tone: 'ok', icon: 'check', label: 'Akkoord', title: 'Script goedgekeurd door de klant', rank: 1 };
  if (brief.scriptsReleasedAt) return { tone: 'neutral', icon: 'clock', label: 'Klant kiest', title: 'De voorstellen staan bij de klant', rank: 2 };
  return { tone: 'attention', icon: 'alert', label: 'Nakijken', title: 'De voorstellen wachten op jouw controle en vrijgave', rank: 4 };
}

export function productionIndicator(brief) {
  if (brief && brief.deliveredAt) return { tone: 'ok', icon: 'check', label: 'Geleverd', title: 'Definitieve audio is geleverd', rank: 5 };
  switch (brief && brief.productionStatus) {
    case 'approved': return { tone: 'ok', icon: 'check', label: 'Goedgekeurd', title: 'De klant keurde de review goed', rank: 4 };
    case 'in_revision': return { tone: 'attention', icon: 'alert', label: 'Feedback', title: 'Feedback van de klant ontvangen', rank: 3 };
    case 'awaiting_review': return { tone: 'neutral', icon: 'clock', label: 'Review verzonden', title: 'Wacht op de review van de klant', rank: 2 };
    default: return { tone: 'neutral', icon: 'dash', label: 'Niet gestart', title: 'De productie is nog niet gestart', rank: 0 };
  }
}
