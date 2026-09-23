// Content for the "Help & uitleg" dashboard tab (app/dashboard/help/page.js).
// Deliberately kept as plain data — not hardcoded JSX in the page — so
// updating this when a feature changes is a content edit here, not a
// layout change there. Each section is rendered by the generic block
// renderer in the page (types: 'p', 'h3', 'ul', 'ol', 'note', 'code').
//
// HOUSEKEEPING: whenever a feature described below changes materially
// (a new dashboard tab, a changed client step, a new integration), update
// the relevant section AND add a line to CHANGELOG at the bottom — that's
// what keeps this page trustworthy instead of quietly going stale.

export const HELP_LAST_UPDATED = '22 september 2026';

export const HELP_SECTIONS = [
  {
    id: 'overzicht',
    title: 'Wat is SpotFlow, in het kort',
    blocks: [
      { type: 'p', text: 'SpotFlow is de tool die het hele traject van een commercial regelt: vanaf het moment dat een klant op "Start je commercial" klikt, tot het moment dat de spot goedgekeurd en geleverd is. Er zijn twee kanten aan de app:' },
      { type: 'ul', items: [
        '**De klantkant** (publiek, geen account nodig): een reeks stappen waarin de klant zijn merk, boodschap, gewenste stem en muziek opgeeft, een AI-gegenereerd script te zien krijgt en later feedback geeft of goedkeurt.',
        '**De studiokant** (dit dashboard, alleen voor TFA, achter een login): waar Marco en Karim alle binnengekomen briefs zien, ze aan iemand toewijzen, scripts bekijken/aanpassen, muziek en stemmen beheren en rapportages bekijken.',
      ] },
      { type: 'h3', text: 'Waar draait het op' },
      { type: 'ul', items: [
        '**Next.js** — het framework waar de hele app in gebouwd is (zowel de klant-pagina\'s als het dashboard).',
        '**Vercel** — waar de app live staat (hosting). Elke keer dat er nieuwe code gepusht wordt naar de `main` branch op GitHub, bouwt Vercel automatisch een nieuwe versie en zet die live.',
        '**Postgres database** — waar alle briefs, muziek, stemmen en instellingen in opgeslagen staan (via Vercel/Neon).',
        '**Clerk** — regelt de login voor dit dashboard. De klantkant heeft nooit een account nodig, dus dat is bewust nergens achter Clerk verstopt.',
        '**Resend** — verstuurt e-mails (bevestiging naar de klant, meldingen naar het team).',
        '**Slack** — stuurt korte meldingen naar een Slack-kanaal bij belangrijke momenten (zie "Meldingen" verderop).',
      ] },
      { type: 'note', text: 'Niets hiervan hoef je te begrijpen om de app te gebruiken — dit stukje is puur voor als iemand zich afvraagt "hoe is dit eigenlijk gebouwd?".' },
    ],
  },
  {
    id: 'klanttraject',
    title: 'Het traject van de klant, stap voor stap',
    blocks: [
      { type: 'p', text: 'Als een klant op de homepage op "Start je commercial" klikt, doorloopt hij een reeks stappen. Elke stap is een eigen pagina en de voortgang wordt automatisch bewaard — de klant kan de link altijd opnieuw openen en verdergaan waar hij gebleven was.' },
      { type: 'ol', items: [
        '**Contact** — naam, bedrijfsnaam, e-mailadres en telefoonnummer van de klant.',
        '**Levering** — wanneer en waar de commercial moet uitzenden (de "op de radio"-datum). Dit is de datum die overal in het dashboard als deadline gebruikt wordt — zie "Belangrijk: air date = deadline" verderop.',
        '**Details** — over het merk/de campagne: doelgroep, wie de beslisser is, de belangrijkste boodschap, USP, gewenste toon (tone of voice) en of er al een budget/prijsidee is.',
        '**Script** — op basis van alles hierboven genereert de AI een scriptvoorstel. De klant kan het script (opnieuw) laten genereren en desgewenst extra variaties aanvragen.',
        '**Stem** — de klant kiest een stem uit de bibliotheek (of geeft een voorkeur op).',
        '**Muziek** — de klant kiest een track/playlist uit de bibliotheek.',
        '**Overzicht** — een laatste samenvatting van alles; zodra de klant hier bevestigt, wordt de brief officieel ingediend: het team krijgt een e-mail + Slack-melding en de klant krijgt zelf een bevestigingsmail met het script erin.',
      ] },
      { type: 'p', text: 'Na het indienen krijgt de klant een link naar zijn eigen **statuspagina** (de "review"-pagina) — dit is geen aparte stap in de rij hierboven, maar een blijvende pagina die de klant later weer kan openen om de voortgang te volgen, feedback te geven op een geleverde versie, of uiteindelijk goed te keuren.' },
    ],
  },
  {
    id: 'scriptgeneratie',
    title: 'Hoe het script gegenereerd wordt',
    blocks: [
      { type: 'p', text: 'Het script wordt automatisch geschreven op basis van wat de klant bij "Details" heeft ingevuld (doelgroep, boodschap, toon, USP, spotlengte, enzovoorts) plus het AI-prompt dat onder het tabblad "AI-prompt" in dit dashboard staat.' },
      { type: 'p', text: 'Er zijn 4 niveaus, in deze volgorde geprobeerd — dit betekent dat de app altijd een script kan maken, ook zonder dat er ooit iets geconfigureerd is:' },
      { type: 'ol', items: [
        '**Claude (Anthropic)** — de beste kwaliteit, wordt gebruikt zodra `ANTHROPIC_API_KEY` is ingesteld (in Vercel).',
        '**Gemini (Google)** — gratis alternatief, wordt alleen gebruikt als Claude niet is ingesteld.',
        '**Ollama** — een eigen gehoste AI-server, alleen relevant als je zelf zoiets draait.',
        '**Vaste sjabloon** — een altijd-werkende, voorspelbare tekst zonder AI, als laatste terugvaloptie.',
      ] },
      { type: 'h3', text: 'Variaties' },
      { type: 'p', text: 'Een klant kan bij de scriptstap vragen om meerdere versies/variaties van hetzelfde script (bijvoorbeeld een net iets andere insteek of lengte). Deze variaties zijn overal zichtbaar waar het hoofdscript ook zichtbaar is: op de klant-pagina, in de bevestigingsmail, én in dit dashboard onder het tabblad "Creatief" van een brief.' },
      { type: 'h3', text: 'Revisierondes / feedback' },
      { type: 'p', text: 'Zodra een spot is opgenomen en aan de klant is voorgelegd (via de statuspagina), kan de klant per ronde ofwel goedkeuren, ofwel feedback achterlaten voor een nieuwe ronde. Het aantal inbegrepen revisierondes staat vast per pakket — gaat een klant daaroverheen, dan is dat zichtbaar in het dashboard (en in de rapportages als "extra ronde").' },
    ],
  },
  {
    id: 'dashboard-tabs',
    title: 'Het dashboard, tab voor tab',
    blocks: [
      { type: 'h3', text: 'Dashboard (overzicht)' },
      { type: 'p', text: 'De hoofdpagina: een tabel met alle briefs. Klik op een brief om het detailpaneel te openen, met tabbladen voor Overzicht (klantgegevens + levering), Team (wie is toegewezen, status) en Creatief (script + variaties, met wijzigingen-vergelijking als het script is aangepast).' },
      { type: 'p', text: 'De tabel zelf is aanpasbaar: rechtsboven zit een knop "⚙ Kolommen" waarmee je kunt kiezen welke kolommen zichtbaar zijn (bijv. aantal revisierondes, aantal variaties, wie is toegewezen, hoe lang een brief al open staat). Deze keuze wordt per browser onthouden.' },
      { type: 'h3', text: 'Bibliotheek' },
      { type: 'p', text: 'Hier beheer je de muziektracks en stemmen waar klanten uit kunnen kiezen bij de "Muziek"- en "Stem"-stappen: uploaden, categoriseren, taggen, verwijderen.' },
      { type: 'h3', text: 'AI-prompt' },
      { type: 'p', text: 'Hier pas je aan hoe de AI schrijft: de toon, aanpak en stijl-instructies die bovenop de klantgegevens komen bij het genereren van een script. Er is een versiegeschiedenis en steeds maximaal één versie "live" tegelijk — zo kun je veilig experimenteren en teruggaan naar een eerdere versie als een nieuwe niet bevalt.' },
      { type: 'h3', text: 'Rapporten' },
      { type: 'p', text: 'Statistieken over alle briefs: hoeveel er binnenkomen, goedkeuringspercentage, gemiddelde doorlooptijd, hoeveel er over de deadline zijn, verdeling per teamlid, populairste muziek/stemmen, enzovoorts. Bovenaan kun je een periode instellen en de resultaten exporteren als CSV (te openen in Excel/Google Sheets).' },
      { type: 'h3', text: 'Help & uitleg' },
      { type: 'p', text: 'Deze pagina — bedoeld als naslagwerk voor iedereen die met SpotFlow werkt maar niet per se de technische kant kent.' },
    ],
  },
  {
    id: 'deadline',
    title: 'Belangrijk: de "op de radio"-datum ís de deadline',
    blocks: [
      { type: 'p', text: 'Er is bewust geen apart intern "deadline"-veld meer. Vroeger kon een producer los een interne deadline instellen, maar dat had geen echte functie — TFA werkt altijd zo snel mogelijk toe naar de datum die de klant zelf heeft opgegeven bij de stap "Levering" (wanneer de commercial moet uitzenden).' },
      { type: 'p', text: 'Die klant-datum is nu overal de deadline: in het detailpaneel, in het Team-tabblad, in de hoofdtabel en in de "over deadline"-statistiek onder Rapporten. Als een brief als "over deadline" wordt gemarkeerd, betekent dat dus letterlijk: de datum waarop de klant hem op de radio wil hebben is al gepasseerd en de spot is nog niet klaar.' },
    ],
  },
  {
    id: 'toegang',
    title: 'Toegang & beveiliging',
    blocks: [
      { type: 'ul', items: [
        'Dit dashboard (**/dashboard** en alles eronder) is de enige plek die een login vereist — via Clerk. Alleen mensen met een account kunnen hier komen.',
        'De hele klantkant (homepage, alle briefstappen, de statuspagina) is bewust altijd publiek en zonder account — een klant moet nooit hoeven inloggen om zijn commercial te regelen.',
        'Om te voorkomen dat willekeurig iedereen met de website-link zomaar een brief kan starten, zit er een **toegangscode** op de "Start je commercial"-knop: alleen een link met de juiste code (`/start?code=...`) maakt direct een nieuwe brief aan; zonder (geldige) code krijg je een klein invulveld voor de code te zien. Deze code stel je zelf in via de `TFA_ACCESS_CODE`-instelling in Vercel en je deelt hem alleen met echte prospects — geen account nodig, wel een drempel voor willekeurige bezoekers en bots.',
      ] },
    ],
  },
  {
    id: 'meldingen',
    title: 'Meldingen: e-mail & Slack',
    blocks: [
      { type: 'p', text: 'Op een paar belangrijke momenten stuurt de app automatisch een melding, via twee onafhankelijke kanalen — als er iets misgaat met de één, heeft dat geen invloed op de ander.' },
      { type: 'h3', text: 'E-mail (via Resend)' },
      { type: 'ul', items: [
        'De klant krijgt een bevestigingsmail zodra hij een brief indient, met het volledige script erin.',
        'Het team (adressen ingesteld via `TEAM_NOTIFY_EMAILS`) krijgt dezelfde soort overzichtsmail, zodat een brief direct ingepland kan worden.',
        'De toegewezen engineer (Marco of Karim, via `ENGINEER_EMAIL_MARCO`/`ENGINEER_EMAIL_KARIM`) krijgt een mail zodra een brief aan hem wordt toegewezen.',
      ] },
      { type: 'h3', text: 'Slack' },
      { type: 'ul', items: [
        '🆕 Nieuwe brief binnen — zodra een klant indient.',
        '👤 Toegewezen — zodra een brief aan iemand wordt toegewezen.',
        '💬 Feedback ontvangen — zodra een klant feedback geeft op een revisieronde in plaats van goed te keuren.',
        '✅ Goedgekeurd/geleverd — zodra de klant de laatste revisieronde goedkeurt (met een directe link naar het Frame.io-bestand als die er is).',
      ] },
      { type: 'p', text: 'De precieze tekst/toon van deze Slack-berichten staat in één bestand in de code (`lib/slack.js`) en is makkelijk aan te passen — vraag het gewoon als de bewoording anders moet.' },
    ],
  },
  {
    id: 'wijzigingslog',
    title: 'Wijzigingslog',
    blocks: [
      { type: 'p', text: 'Een korte, lopende lijst van de belangrijkste functionele veranderingen — zodat iedereen kan zien wat er recent is bijgekomen zonder de hele geschiedenis te hoeven navragen.' },
      { type: 'ul', items: [
        '**22 sep 2026** — Toegangscode toegevoegd voor het starten van een nieuwe brief (zie "Toegang & beveiliging"); deze Help-pagina toegevoegd.',
        '**22 sep 2026** — Studiofoto\'s (Karim & Marco) tijdelijk weer van de homepage gehaald na een paar ontwerp-iteraties.',
        '**22 sep 2026** — Interne "deadline" vervangen door de klant\'s eigen "op de radio"-datum, overal in het dashboard en de rapportages (zie "Belangrijk: de op de radio-datum ís de deadline").',
        '**22 sep 2026** — Dashboard-tabel kolommen zijn nu zelf te kiezen/verbergen (⚙ Kolommen), inclusief nieuwe kolommen zoals aantal revisierondes en aantal variaties; scriptvariaties zijn nu ook zichtbaar in het dashboard zelf (Creatief-tabblad), niet alleen in de klant-mail.',
      ] },
      { type: 'note', text: 'Dit lijstje bijhouden is een van de dingen die dit tabblad nuttig houdt — bij elke noemenswaardige nieuwe feature hoort hier een regel bij te komen.' },
    ],
  },
];
