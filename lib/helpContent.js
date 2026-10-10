// Content for the "Help & uitleg" dashboard tab (app/dashboard/help/page.js).
// Deliberately kept as plain data — not hardcoded JSX in the page — so
// updating this when a feature changes is a content edit here, not a
// layout change there. Each section is rendered by the generic block
// renderer in the page (types: 'p', 'h3', 'ul', 'ol', 'note', 'code').
//
// STANDING RULE (Karim): with EVERY feature change, update the relevant
// section here (as detailed as possible, written so someone who has never
// seen the app or its backend can follow it) AND add a line to the
// wijzigingslog at the bottom AND bump HELP_LAST_UPDATED.
//
// HOUSEKEEPING: whenever a feature described below changes materially
// (a new dashboard tab, a changed client step, a new integration), update
// the relevant section AND add a line to CHANGELOG at the bottom — that's
// what keeps this page trustworthy instead of quietly going stale.

export const HELP_LAST_UPDATED = '10 oktober 2026';

export const HELP_SECTIONS = [
  {
    id: 'overzicht',
    title: 'Wat is SpotFlow, in het kort',
    blocks: [
      { type: 'p', text: 'SpotFlow is de tool die het hele traject van een commercial regelt: vanaf het moment dat een klant een toegangscode intikt en een brief invult, tot het moment dat de spot goedgekeurd en geleverd is. Er zijn drie "gebruikers" van de app:' },
      { type: 'ul', items: [
        '**De klant** (publiek, geen account nodig): vult de brief in, wacht tot TFA de scriptvoorstellen heeft vrijgegeven, kiest en past het script aan, kiest stem en muziek, en volgt daarna de status.',
        '**TFA (studio)** — Marco en Karim: loggen in op dit dashboard, zien alle briefs, schrijven/controleren de scripts, geven ze vrij aan de klant, beheren de bibliotheek, de AI-prompt, de agentschappen en de rapporten.',
        '**Een agentschap** (bijv. Advision Media): een medewerker logt in met hetzelfde loginscherm als TFA, maar ziet alleen-lezen en alleen de briefs van de eigen klanten (zie "Agentschappen & toegang").',
      ] },
      { type: 'h3', text: 'Waar draait het op' },
      { type: 'ul', items: [
        '**Next.js** — het framework waar de hele app in gebouwd is (zowel de klantpagina\'s als het dashboard).',
        '**Vercel** — waar de app live staat (hosting). Elke keer dat er nieuwe code gepusht wordt naar de `main` branch op GitHub (repo TFA-Studios/TFA_Radio), bouwt Vercel automatisch een nieuwe versie en zet die live.',
        '**Postgres database** — waar alle briefs, muziek, stemmen, agentschappen en instellingen in opgeslagen staan (via Vercel/Neon).',
        '**Vercel Blob** — bestandsopslag voor audio (bibliotheek) en voor logo\'s die je in het Agentschappen-scherm uploadt.',
        '**Clerk** — regelt de login voor dit dashboard (voor zowel TFA als agentschappen). De klantkant heeft nooit een account nodig.',
        '**Anthropic (Claude)** — schrijft de scriptvoorstellen; zie "Hoe het script gegenereerd wordt".',
        '**Resend** — verstuurt e-mails (bevestiging naar de klant, meldingen naar het team).',
        '**Slack** — stuurt korte meldingen naar een Slack-kanaal bij belangrijke momenten (zie "Meldingen").',
      ] },
      { type: 'note', text: 'Niets hiervan hoef je te begrijpen om de app te gebruiken — dit stukje is puur voor als iemand zich afvraagt "hoe is dit eigenlijk gebouwd?". Verderop staat een aparte sectie "Onder de motorkap" met alle pagina\'s, API-routes en bestanden.' },
    ],
  },
  {
    id: 'klanttraject',
    title: 'Het traject van de klant, stap voor stap',
    blocks: [
      { type: 'p', text: 'Een klant komt binnen via een link met toegangscode of tikt de code in op /start. Elke stap is een eigen pagina; de voortgang wordt automatisch bewaard, dus de klant kan de link altijd opnieuw openen en verdergaan waar hij gebleven was (hij kan de link ook naar zichzelf mailen).' },
      { type: 'p', text: 'Een brief doorloopt vier fasen. De app berekent de fase altijd opnieuw uit tijdstempels op de brief, en stuurt de klant naar de juiste pagina als hij een stap probeert te openen die nog niet aan de beurt is.' },
      { type: 'ol', items: [
        '**Invullen** — de klant doorloopt Contact (naam, bedrijf, e-mail), Levering (wanneer de spot op de radio moet; dit is de deadline) en Brief (product, doelgroep, USP, toon, enzovoorts). Daarna klikt hij op versturen.',
        '**Wachten (TFA schrijft)** — direct na versturen ziet de klant een rustige statuspagina: "je brief is verstuurd, een copywriter van TFA gaat aan de slag". De klant hoeft nooit op de AI te wachten: het schrijven gebeurt op de achtergrond (zie volgende sectie).',
        '**Kiezen** — zodra TFA de drie scriptvoorstellen heeft gecontroleerd en vrijgegeven, krijgt de klant een e-mail "je scripts staan klaar". Hij kiest er één, past de tekst desgewenst aan, en gaat verder met Stem en Muziek.',
        '**Afronden** — een laatste Overzicht. Na bevestigen is de brief definitief; TFA gaat produceren en de klant volgt de voortgang op de statuspagina, geeft feedback op revisierondes of keurt goed.',
      ] },
      { type: 'p', text: 'Bij een agentschap met een **eigen script** (zie "Agentschappen & toegang") wordt de wachtfase overgeslagen: dat agentschap levert het script zelf aan, en TFA zet het in het dashboard.' },
      { type: 'note', text: 'Welke vragen een klant ziet kan per agentschap verschillen (vragen verborgen of extra vragen toegevoegd) — zie "Formulieren per agentschap".' },
    ],
  },
  {
    id: 'scriptgeneratie',
    title: 'Hoe het script gegenereerd wordt',
    blocks: [
      { type: 'p', text: 'Zodra de klant zijn brief verstuurt, start de server op de achtergrond het schrijven van **drie scriptvoorstellen** ("drafts"). Dit gebeurt met `waitUntil` (een Vercel-functie die werk laat doorlopen nadat het antwoord al naar de klant is verstuurd), dus de klant ziet meteen de bevestiging en hoeft niet te wachten. Onder de motorkap: het verzoek `PATCH /api/briefs/[id]` markeert de brief als ingediend, antwoordt direct, en de AI-aanroepen lopen daarna door.' },
      { type: 'p', text: 'De drie voorstellen worden bewaard op de brief (`scriptHistory`, maximaal 3). Eén ervan is het actieve script (`generatedScript`). Ze zijn **nog niet zichtbaar voor de klant** totdat TFA ze vrijgeeft.' },
      { type: 'h3', text: 'Wat TFA doet in het dashboard' },
      { type: 'ul', items: [
        'Open de brief, tabblad **Creatief**, paneel "Scriptvoorstellen".',
        '**Bewerken** — pas de tekst van een voorstel aan.',
        '**Opnieuw schrijven** — laat de AI een voorstel (of alle drie) opnieuw maken.',
        '**Eigen script toevoegen** — voor agentschappen met een eigen copywriter, of als TFA zelf iets schrijft.',
        '**Vrijgeven aan klant** — pas dan krijgt de klant de e-mail en ziet hij de keuze. Dit is het moment dat de brief van fase "wachten" naar "kiezen" gaat.',
      ] },
      { type: 'h3', text: 'Welke AI wordt gebruikt' },
      { type: 'p', text: 'In deze volgorde geprobeerd, zodat er altijd een script kan komen ook zonder dat er iets geconfigureerd is:' },
      { type: 'ol', items: [
        '**Claude (Anthropic)** — beste kwaliteit; gebruikt zodra `ANTHROPIC_API_KEY` in Vercel staat (dat is nu het geval).',
        '**Gemini (Google)** — alternatief als Claude niet is ingesteld.',
        '**Ollama** — een eigen gehoste AI-server, alleen relevant als je die draait.',
        '**Vaste sjabloon** — altijd-werkende tekst zonder AI, als laatste terugvaloptie.',
      ] },
      { type: 'p', text: 'De stijl en instructies voor de AI beheer je onder het tabblad "AI-prompt".' },
      { type: 'h3', text: 'Variaties' },
      { type: 'p', text: 'Een klant kan extra variaties (net andere insteek of lengte) van het gekozen script aanvragen; die zijn zichtbaar op de klantpagina, in de bevestigingsmail en in het dashboard onder "Creatief".' },
      { type: 'h3', text: 'Revisierondes / feedback' },
      { type: 'p', text: 'Zodra een spot is opgenomen en aan de klant is voorgelegd (via de statuspagina), kan de klant per ronde goedkeuren of feedback achterlaten. Het aantal inbegrepen rondes staat vast per pakket; daarboven telt het als "extra ronde" in dashboard en rapporten.' },
    ],
  },
  {
    id: 'dashboard-tabs',
    title: 'Het dashboard, tab voor tab',
    blocks: [
      { type: 'h3', text: 'Dashboard (overzicht)' },
      { type: 'p', text: 'De hoofdpagina: een tabel met alle briefs. Klik op een brief om het detailpaneel te openen, met tabbladen voor Overzicht (klantgegevens + levering), Team (wie is toegewezen, status) en Creatief (script + variaties, met wijzigingen-vergelijking als het script is aangepast).' },
      { type: 'p', text: 'De tabel zelf is aanpasbaar: rechtsboven zit een knop "⚙ Kolommen" waarmee je kunt kiezen welke kolommen zichtbaar zijn (bijv. aantal revisierondes, aantal variaties, wie is toegewezen, hoe lang een brief al open staat). Deze keuze wordt per browser onthouden.' },
      { type: 'p', text: 'In het Creatief-tabblad van een brief staat het paneel **Scriptvoorstellen** (zie "Hoe het script gegenereerd wordt"). Een brief die nog op vrijgave door TFA wacht heeft de status "Script schrijven"; na vrijgave "Klant kiest script".' },
      { type: 'h3', text: 'Agentschappen' },
      { type: 'p', text: 'Hier beheer je samenwerkende agentschappen zelf, zonder code: naam, hoofdcode, extra codes, contactadres, logins, scriptmodus, formulierinstellingen en logo\'s. Volledige uitleg staat onder "Agentschappen & toegang" en "Co-branding".' },
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
    id: 'agentschappen',
    title: 'Agentschappen & toegang',
    blocks: [
      { type: 'p', text: 'Een agentschap is een partij die klanten naar TFA doorverwijst (nu: Advision Media, later bijv. Talpa). Alles over een agentschap beheer je zelf onder **Agentschappen** in het dashboard; er is geen code nodig om een nieuw agentschap toe te voegen.' },
      { type: 'h3', text: 'Toegangscodes' },
      { type: 'ul', items: [
        'Ieder agentschap heeft een **hoofdcode** (bijv. "TFA 2026 Advision") en kan daarnaast **extra codes** hebben (één per regel). Alle codes openen hetzelfde agentschap: zelfde logo\'s, zelfde formulier, zelfde logins.',
        'De code die de klant intikte wordt op de brief bewaard (`agencyCode`), dus je kunt later zien via welke code iemand binnenkwam — handig om bijv. een code per verkoopteam uit te delen.',
        'Een code mag maar bij één agentschap horen; opslaan met een code die al bestaat wordt geweigerd ("een van deze codes wordt al gebruikt").',
        'Verwijder je een code, dan krijgen nieuwe klanten met die code geen agentschaps-uiterlijk meer. Bestaande briefs blijven gekoppeld.',
        'Hoe het werkt: bij het aanmaken van een brief zoekt de server (`POST /api/briefs`) de code zonder hoofdlettergevoeligheid op bij alle agentschappen en **bevriest** de naam, het contactadres, het formulierprofiel en de logo\'s op de brief. Wijzigt het agentschap later logo\'s, dan worden de bestaande briefs bijgewerkt; wijzigt de code, dan verandert de brief niet.',
      ] },
      { type: 'h3', text: 'Logins van een agentschap' },
      { type: 'ol', items: [
        'Voeg in het Agentschappen-scherm de e-mailadressen van de medewerkers toe bij "Logins".',
        'Nodig dezelfde personen uit in **Clerk** (met dat e-mailadres). Het Agentschappen-scherm kan geen Clerk-account aanmaken.',
        'Bij het inloggen controleert de app of een **geverifieerd** e-mailadres bij een agentschap staat. Zo ja: alleen-lezen dashboard met uitsluitend de briefs van dat agentschap (gekoppeld via het interne `agencyId`).',
      ] },
      { type: 'note', text: 'Briefs die zijn aangemaakt vóór agentschapscodes bestonden hebben geen agentschap en zijn dus onzichtbaar voor agentschapslogins; ze kunnen achteraf aan een agentschap gekoppeld worden.' },
      { type: 'h3', text: 'Scriptmodus per agentschap' },
      { type: 'ul', items: [
        '**TFA schrijft en geeft vrij** (standaard): de workflow uit "Het traject van de klant".',
        '**Agentschap levert eigen script**: de klant slaat de wachtfase over; TFA plaatst het aangeleverde script in het dashboard en er worden geen AI-drafts geschreven. In Slack staat dan "eigen script" in plaats van een aantal drafts.',
      ] },
    ],
  },
  {
    id: 'formulieren',
    title: 'Formulieren per agentschap',
    blocks: [
      { type: 'p', text: 'Niet ieder agentschap heeft hetzelfde formulier nodig. Per agentschap stel je in het Agentschappen-scherm in:' },
      { type: 'ul', items: [
        '**Verborgen vragen** — vink onderdelen aan die dit agentschap niet nodig heeft (ze verdwijnen uit het klantformulier én uit de PDF/dashboardweergave).',
        '**Extra vragen** — eigen vragen met een type (tekst, keuze, enzovoorts). Antwoorden worden bewaard op de brief (`extraAnswers`) en verschijnen in het dashboard (kaart op de brief), de PDF en de mails.',
        '**Formuliersjabloon** (`formKey`) — nu alleen "Standaard"; de plek waar later een compleet eigen formulier voor één agentschap gekoppeld kan worden (dat vraagt wel codewerk).',
      ] },
      { type: 'p', text: 'Technisch: de instellingen staan als JSON (`formConfig`) op het agentschap. `lib/formProfile.js` normaliseert ze en berekent het "profiel"; dat profiel wordt bij het aanmaken van de brief als `formProfile` op de brief bevroren, zodat een latere wijziging lopende briefs niet verandert.' },
    ],
  },
  {
    id: 'cobranding',
    title: 'Co-branding (logos & achtergrondicoon)',
    blocks: [
      { type: 'p', text: 'Voor briefs van een agentschap met logo\'s zien klanten "in samenwerking met" + het logo van het agentschap, naast het SpotFlow-logo. Briefs zonder agentschapslogo zien niets hiervan, en de homepage blijft altijd puur TFA.' },
      { type: 'h3', text: 'Drie afbeeldingen per agentschap' },
      { type: 'ul', items: [
        '**Logo voor donkere achtergrond** — gebruikt in de zijbalk van het klantformulier en de laadanimatie.',
        '**Logo voor lichte achtergrond** — gebruikt op statuspagina\'s, in e-mails en in de PDF.',
        '**Icoon** — het losse icoon (favicon-achtig), getoond als zeer vage achtergrond (ongeveer 4% dekking) rechtsonder op de formulierpagina\'s en statuspagina\'s.',
      ] },
      { type: 'p', text: 'Je zet ze in het Agentschappen-scherm door een bestand te uploaden (PNG/WebP/JPG/SVG, max 2 MB; vereist Vercel Blob) of een https-link te plakken. Naast elk veld staat een voorbeeld.' },
      { type: 'h3', text: 'Uitlijning (waarom het er strak uitziet)' },
      { type: 'p', text: 'Het woordmerk van het agentschap krijgt dezelfde hoofdletterhoogte als het woord "SpotFlow" en ze delen één basislijn, zodat een lijn onder "TFA SpotFlow" ook onder "ADVISION MEDIA" doorloopt. De constanten daarvoor staan in `components/PartnerBadge.js` (en de e-mailkop in `lib/email.js`) en zijn afgestemd op de huidige Advision-bestanden (breed formaat 1329x256 met slogan). Een agentschapslogo met een heel andere vorm kan een kleine bijstelling vragen.' },
      { type: 'p', text: 'Ook de browsertab toont de samenwerking, bijv. "TFA SpotFlow × Advision Media".' },
    ],
  },
  {
    id: 'motorkap',
    title: 'Onder de motorkap: pagina-overzicht, routes & bestanden',
    blocks: [
      { type: 'p', text: 'Deze sectie is voor iedereen die wil begrijpen waar iets in de code staat of hoe een verzoek door de app loopt.' },
      { type: 'h3', text: 'Klantpagina\'s (publiek)' },
      { type: 'ul', items: [
        '`/` — homepage. `/start` — toegangscode invullen en brief aanmaken.',
        '`/brief/[id]/contact`, `/delivery`, `/details` — de drie invulstappen. `/script`, `/script/variations`, `/voice`, `/music`, `/overview` — de stappen na vrijgave van de scripts.',
        '`/brief/[id]/review` — de blijvende statuspagina (toont per fase een andere weergave: wachten, kiezen, in productie, revisie, goedgekeurd).',
        'De zijbalk en layout van alle stappen komt uit `components/StepShell.js`; de stappen-volgorde en teksten uit `components/flowData.js`; het laden/opslaan van een brief in de browser uit `components/useBrief.js`.',
      ] },
      { type: 'h3', text: 'Dashboardpagina\'s (login nodig)' },
      { type: 'ul', items: [
        '`/dashboard` (briefs), `/dashboard/agencies`, `/dashboard/library`, `/dashboard/prompt`, `/dashboard/reports`, `/dashboard/help`. Alles behalve het hoofdscherm is alleen voor TFA.',
        'Het hoofdscherm is `components/DashboardClient.js`; de zijbalk met menu (verschilt per rol) is `components/DashboardSidebar.js`.',
      ] },
      { type: 'h3', text: 'API-routes (de achterdeur die de pagina\'s aanroepen)' },
      { type: 'ul', items: [
        '`POST /api/briefs` — maakt een nieuwe brief aan, met controle van de toegangscode (zoekt het agentschap op en bevriest de gegevens).',
        '`GET/PATCH /api/briefs/[id]` — brief ophalen of bijwerken door de klant; bij versturen start hier het achtergrond-schrijven van de drafts. Alleen velden uit een vaste lijst (`ALLOWED_FIELDS` in `lib/db.js`) mogen door de klant geschreven worden.',
        '`/api/briefs/[id]/select-script`, `edit`, `resume-link`, `review-approve`, `review-feedback` — klantacties: script kiezen, bewerken, link mailen, goedkeuren, feedback geven.',
        '`/api/dashboard/briefs/[id]/...` — `status`, `meta`, `notes`, `delivery`, `review-round`, `pdf`, `scripts` (opnieuw schrijven, eigen script, vrijgeven, draft aanpassen). Alleen voor TFA, behalve het lezen van een brief door een agentschap dat de brief mag zien.',
        '`/api/dashboard/agencies` (lijst/aanmaken), `/agencies/[id]` (wijzigen/verwijderen; geeft 409 bij dubbele code), `/agencies/logo` (logo uploaden).',
        '`/api/dashboard/prompt-versions`, `/delivery-recipients`, `/reports/export`, `/library/storage` — AI-prompt, bezorgadressen, CSV-export, opslaggebruik.',
        '`/api/library/*` — muziek, stemmen en categorieën beheren en audio uploaden.',
      ] },
      { type: 'h3', text: 'Belangrijkste bestanden in lib/' },
      { type: 'ul', items: [
        '`db.js` — alle data. Werkt met Postgres in productie en met een tijdelijk geheugen tijdens lokaal testen (twee versies van elke functie). Bevat ook de kleine database-aanpassingen (`runMigrations`), die automatisch worden uitgevoerd.',
        '`access.js` — bepaalt wie je bent (staff/agentschap/anoniem) en welke briefs je mag zien; beschermt alle TFA-only routes en pagina\'s.',
        '`formProfile.js` — verborgen/extra vragen per agentschap. `scriptgen.js` — AI-scripts. `promptVersions.js` — AI-prompt versies. `reports.js` — statistieken.',
        '`email.js` — alle e-mails (incl. gedeelde kop met co-branding). `slack.js` — Slack-berichten. `briefPdf.js` — de PDF van een brief, met agentschapslogo en extra vragen.',
      ] },
      { type: 'h3', text: 'Fasen van een brief' },
      { type: 'p', text: 'invullen, dan schrijven (is ingediend, `submittedAt`), dan kiezen (scripts vrijgegeven, `scriptsReleasedAt`), dan afronden (bevestigd, `finalizedAt`). De functie `briefStageOf` rekent dit uit en wordt overal gebruikt om de juiste pagina en tekst te tonen en om te voorkomen dat een klant een stap te vroeg opent.' },
      { type: 'h3', text: 'Instellingen in Vercel (environment variables)' },
      { type: 'ul', items: [
        '**Database:** `POSTGRES_URL`. **Login:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.',
        '**AI:** `ANTHROPIC_API_KEY` (+ optioneel `ANTHROPIC_MODEL`), `GEMINI_API_KEY`, `OLLAMA_HOST`/`OLLAMA_MODEL`.',
        '**E-mail:** `RESEND_API_KEY`, `SENDER_EMAIL`, `TEAM_NOTIFY_EMAILS`, `ADMIN_NOTIFY_EMAIL`, `ENGINEER_EMAIL_MARCO`, `ENGINEER_EMAIL_KARIM`. **Slack:** `SLACK_WEBHOOK_URL`.',
        '**Toegang:** `TFA_ACCESS_CODE`. **Bestanden:** `BLOB_READ_WRITE_TOKEN` of `BLOB_STORE_ID`. Optioneel: `NEXT_PUBLIC_APP_URL` (vaste basis-URL voor links in e-mails).',
      ] },
      { type: 'h3', text: 'Testmodus: formulier automatisch invullen' },
      { type: 'p', text: 'Om nieuwe functies te testen zonder steeds alles opnieuw in te typen, is er een verborgen knop "🧪 Testdata invullen" (linksonder). Hij verschijnt **alleen** als je de link opent met `?test=1` erachter, bijvoorbeeld `/start?code=JOUWCODE&test=1` (of `?test=1` aan een bestaande briefstap). Die keuze wordt voor het browsertabblad onthouden; met `?test=0` zet je hem weer uit. Klanten zien de knop nooit, omdat zij zo\'n link niet hebben.' },
      { type: 'p', text: 'Een klik vult contact, levering en brief in met een realistisch voorbeeld (Bakkerij Van Dijk, 30 seconden, 100.000 impressies, uitzenddatum over drie weken, B2C, toon warm/vriendelijk/oprecht), plus een voorbeeldantwoord op de extra vragen van het agentschap als die er zijn. Het contact-e-mailadres is `karim@tfa.studio`, dus bevestigingsmails komen bij jou binnen — controleer dat altijd even voordat je op versturen klikt. Het voorbeeld staat in `components/TestAutofill.js`; wil je ander voorbeeldmateriaal, pas het daar aan.' },
      { type: 'h3', text: 'Nieuwe versie live zetten' },
      { type: 'p', text: 'Wijzigingen worden gebouwd in een testomgeving en daarna door Karim in zijn eigen kopie van de repository gezet, gecommit en gepusht naar `main`. Vercel bouwt dan automatisch en zet de nieuwe versie live (meestal binnen een paar minuten).' },
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
        'Het dashboard (**/dashboard** en alles eronder, plus **/api/dashboard/...**) vereist een login via Clerk. Dit wordt afgedwongen op twee plekken: de Clerk-middleware (`middleware.js`) en een extra controle in de code zelf (`lib/access.js`), zodat een ingelogd agentschap nooit bij TFA-only pagina\'s kan komen.',
        'Er zijn twee rollen: **staff** (TFA, ziet en kan alles) en **agency** (een gebruiker wiens geverifieerde e-mailadres bij een agentschap staat; alleen-lezen, alleen eigen briefs). Iedere ingelogde gebruiker die niet aan een agentschap gekoppeld is, telt als staff — zet Clerk daarom op **alleen op uitnodiging** (invite-only), zodat niemand zich zelf kan registreren.',
        'De klantkant (homepage, briefstappen, statuspagina) is altijd publiek. Een klant heeft alleen de link naar zijn eigen brief nodig; de lijst van alle briefs is niet meer openbaar (de oude publieke lijst-route is verwijderd).',
        'Een nieuwe brief starten vereist een **toegangscode** (`/start?code=...` of invullen op /start). Zie "Agentschappen & toegang" voor hoe codes werken. De algemene TFA-code staat in de `TFA_ACCESS_CODE`-instelling in Vercel.',
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
        'De klant krijgt een bevestigingsmail zodra hij een brief indient ("we zijn aan de slag"). Zodra TFA de scripts vrijgeeft, krijgt hij een tweede mail "je scripts staan klaar" met de link om te kiezen. De e-mailkop toont het agentschapslogo als de brief via een agentschap kwam.',
        'Het team (adressen ingesteld via `TEAM_NOTIFY_EMAILS`) krijgt dezelfde soort overzichtsmail, zodat een brief direct ingepland kan worden.',
        'De toegewezen engineer (Marco of Karim, via `ENGINEER_EMAIL_MARCO`/`ENGINEER_EMAIL_KARIM`) krijgt een mail zodra een brief aan hem wordt toegewezen.',
      ] },
      { type: 'h3', text: 'Slack' },
      { type: 'ul', items: [
        '🆕 Nieuwe brief binnen — zodra een klant indient (met het aantal drafts dat op de achtergrond geschreven wordt, of "eigen script" bij een agentschap met eigen copywriter).',
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
        '**10 okt 2026** — Verborgen testmodus: met `?test=1` in de link verschijnt een knop "Testdata invullen" die het hele klantformulier met een voorbeeld invult (contact-e-mail karim@tfa.studio). Alleen zichtbaar met die link; klanten zien hem niet.',
        '**8 okt 2026** — Official Advision-logo\'s (kleur + wit, met slogan) en losstaand icoon toegevoegd; uitlijning (hoofdletterhoogte en basislijn t.o.v. SpotFlow) opnieuw afgestemd voor web, e-mail en PDF. Het icoon staat als vaag achtergrondwatermerk (ongeveer 4%) in het klantformulier en de statuspagina\'s, alleen bij agentschappen met een icoon.',
        '**8 okt 2026** — Meerdere toegangscodes per agentschap (hoofdcode + extra codes, geen dubbele codes tussen agentschappen); gebruikte code wordt op de brief bewaard. In het Agentschappen-scherm zijn extra codes, logo\'s en icoon zelf te beheren, met upload en voorbeeld.',
        '**Okt 2026** — Meerdere agentschappen: eigen formulierprofiel (verborgen/extra vragen), scriptmodus (TFA schrijft of agentschap levert), en agentschapslogins (alleen-lezen, alleen eigen briefs, gekoppeld via geverifieerd Clerk-e-mailadres). Alle TFA-only routes en pagina\'s kregen een extra rolcontrole; de publieke lijst van alle briefs is verwijderd.',
        '**Okt 2026** — Nieuwe workflow met copywriter: klant verstuurt brief en ziet een wachtpagina; drie scriptvoorstellen worden op de achtergrond geschreven, TFA controleert en geeft vrij, klant kiest en past aan, daarna stem, muziek en bevestiging. Nieuwe fasen (invullen/schrijven/kiezen/afronden) en een "je scripts staan klaar"-mail.',
        '**23 sep 2026** — Agentschappen toegevoegd: per samenwerkende agency (bijv. Advision Media) een eigen toegangscode, beheerd via het nieuwe "Agentschappen"-scherm. Een brief die via zo\'n code binnenkomt, wordt er blijvend aan gekoppeld — overal waar voorheen altijd "Advision Media" stond (statuspagina, bevestigingsmail, Uitlevering-tab) staat nu de juiste agency; nieuwe "Agency"-kolom in de hoofdtabel.',
        '**22 sep 2026** — Toegangscode toegevoegd voor het starten van een nieuwe brief (zie "Toegang & beveiliging"); deze Help-pagina toegevoegd.',
        '**22 sep 2026** — Studiofoto\'s (Karim & Marco) tijdelijk weer van de homepage gehaald na een paar ontwerp-iteraties.',
        '**22 sep 2026** — Interne "deadline" vervangen door de klant\'s eigen "op de radio"-datum, overal in het dashboard en de rapportages (zie "Belangrijk: de op de radio-datum ís de deadline").',
        '**22 sep 2026** — Dashboard-tabel kolommen zijn nu zelf te kiezen/verbergen (⚙ Kolommen), inclusief nieuwe kolommen zoals aantal revisierondes en aantal variaties; scriptvariaties zijn nu ook zichtbaar in het dashboard zelf (Creatief-tabblad), niet alleen in de klant-mail.',
      ] },
      { type: 'note', text: 'Dit lijstje bijhouden is een van de dingen die dit tabblad nuttig houdt — bij elke noemenswaardige nieuwe feature hoort hier een regel bij te komen.' },
    ],
  },
];
