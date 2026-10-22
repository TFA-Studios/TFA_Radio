// Turns a failed AI call into a short Dutch reason a producer can act on.
// Never includes keys or raw provider output.
export function describeAiError(provider, err) {
  const msg = String((err && err.message) || '');
  const status = (msg.match(/API error (\d{3})/) || [])[1];
  const name = provider;
  let reason = 'onbekende fout (zie de logs met het foutnummer)';
  if (/timed out|ETIMEDOUT/i.test(msg)) reason = 'het antwoord kwam te laat (time-out)';
  else if (/truncated|max_tokens/i.test(msg)) reason = 'het antwoord werd afgekapt; probeer het opnieuw';
  else if (/no JSON|missing "main"|JSON/i.test(msg)) reason = 'het antwoord was niet in het verwachte formaat; probeer het opnieuw';
  else if (status === '401' || status === '403') reason = 'de API-sleutel is ongeldig of heeft geen toegang (controleer de sleutel in Vercel)';
  else if (status === '404') reason = 'het ingestelde model bestaat niet (controleer ANTHROPIC_MODEL in Vercel)';
  else if (status === '429') reason = 'te veel verzoeken of de limiet is bereikt; wacht even';
  else if (status === '400' && /credit|balance|billing/i.test(msg)) reason = 'het tegoed bij de AI-aanbieder is op';
  else if (status === '400') reason = 'het verzoek werd geweigerd (controleer het model en de instellingen)';
  else if (status === '529' || (status && status.startsWith('5'))) reason = 'de AI-service is overbelast of storing; probeer het zo opnieuw';
  return 'De AI-scriptservice (' + name + ') gaf een fout: ' + reason + '.';
}

// Errors that will not fix themselves by trying again right away.
export function isFatalAiError(err) {
  return /API error (400|401|403|404)\b/.test(String((err && err.message) || ''));
}
