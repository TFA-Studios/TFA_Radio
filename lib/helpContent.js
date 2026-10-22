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

export const HELP_LAST_UPDATED = '22 oktober 2026';

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
        '**Invullen** — de klant doorloopt Contact (naam, bedrijf, e-mail), Levering (aantal impressies, lengte, variaties en wanneer de spot live gaat) en Brief (product, doelgroep, USP, toon, enzovoorts). **Impressies** is een open veld: de klant typt zoals hij wil (`250.000`, `500k`, `1,5 miljoen`) en de app leest dat als een getal en laat meteen zien hoe ze het begrijpt. **Live-datum:** weet de klant de datum nog niet, dan geeft hij een maand op (nu ook maanden volgend jaar, bijv. maart 2027); TFA zet de definitieve datum later zelf in het dashboard (tabblad Team). **Doelgroep:** B2B of B2C, en onopvallend ook "beide" (dan vraagt de app of het één commercial voor beide is, of dat het verschil in de variaties zit). Daarnaast een optioneel veld **verdeling man / vrouw**: de klant schrijft bijv. `man / vrouw - 30 / 70` en de app leest dat als 30% mannen en 70% vrouwen (de volgorde van de woorden bepaalt welk getal bij wie hoort; zonder woorden gaan we uit van man eerst). Wil de klant variaties, dan vraagt de Brief-stap ook **waar elke variatie over gaat** (andere vestiging, website, aanbod of uitzendperiode, met een korte toelichting en optioneel wanneer hij uitzendt). Daarna klikt hij op versturen.',
        '**Wachten (TFA schrijft)** — direct na versturen ziet de klant een rustige statuspagina: "je brief is verstuurd, een copywriter van TFA gaat aan de slag". De klant hoeft nooit op de AI te wachten: het schrijven gebeurt op de achtergrond (zie volgende sectie).',
        '**Kiezen** — zodra TFA de drie scriptvoorstellen heeft gecontroleerd en vrijgegeven, krijgt de klant een e-mail "je scripts staan klaar". Hij kiest er één en past de tekst desgewenst aan. Onder het tekstvak staat een kleine knop "Aanpassing opslaan" (alleen om een wijziging vast te leggen; er wordt ook automatisch bewaard). Het script staat in het gewone lettertype van het formulier, maar met een gouden rand en lichte achtergrond zodat het opvalt. Heeft TFA een **aanbeveling** meegegeven, dan staat bij dat voorstel een klein label "Onze aanbeveling" met (optioneel) de reden; er wordt niets vooraf aangevinkt. Onderaan staat bescheiden de link "Past geen van deze voorstellen bij je?" waarmee de klant ons (met een korte toelichting) laat weten dat niets past. De grote knop onderaan is alleen **goedkeuren en verder**: naar de variatie(s) als die er zijn, anders naar Stem en Muziek. Bij goedkeuren worden de aanpassingen van de klant ook **doorgevoerd in de variaties**: elke variatie bouwt voort op het gekozen (en aangepaste) script en behoudt alleen zijn eigen verschil (andere vestiging, actie enzovoort). Op de variatiepagina ziet de klant bovenaan waar de variatie over gaat.',
        '**Afronden** — een laatste Overzicht. Na bevestigen gaat de brief naar TFA; TFA gaat produceren en de klant volgt de voortgang op de statuspagina, geeft feedback op revisierondes of keurt goed. **Let op:** heeft de klant het script of een variatie aangepast, dan staat in de bevestigingsmail en op de pagina uitdrukkelijk dat het script nog **niet definitief goedgekeurd** is: TFA controleert eerst de aanpassingen (zie "Scriptcontrole & aanbeveling").',
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
        'Open de brief, tabblad **Script**, paneel "Scriptvoorstellen".',
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
      { type: 'p', text: 'Vraagt de klant variaties aan (bij Levering), dan geeft hij bij Brief per variatie aan **waar die over gaat**: een andere vestiging of locatie, website, aanbod of actie, of uitzendperiode (zoals Black Friday), plus een korte toelichting. Dat staat als JSON in het veld `variationDetail` van de brief. De AI krijgt die toelichting mee en schrijft bij elk van de drie voorstellen ook **de variatietekst(en)**: hetzelfde script, met alleen de passende onderdelen aangepast. Die teksten staan per voorstel in de drafts (`variations`) en worden de startpunten van de klant op de variatiepagina. De toelichting is ook zichtbaar in het dashboard (Overzicht en Script), op het klantoverzicht, in de e-mail en in de PDF.' },
      { type: 'h3', text: 'Revisierondes / feedback' },
      { type: 'p', text: 'Zodra een spot is opgenomen en aan de klant is voorgelegd (via de statuspagina), kan de klant per ronde goedkeuren of feedback achterlaten. Het aantal inbegrepen rondes staat vast per pakket; daarboven telt het als "extra ronde" in dashboard en rapporten.' },
    ],
  },
  {
    id: 'scriptcontrole',
    title: 'Scriptcontrole & aanbeveling',
    blocks: [
      { type: 'p', text: 'Twee extra stukjes in het script-traject, beide bedoeld om als professional te sturen zonder de klant iets op te dringen.' },
      { type: 'h3', text: 'Aanbeveling meegeven (voor het vrijgeven)' },
      { type: 'p', text: 'In het tabblad **Script** staat onder elk concept een vinkje "Hier neigen wij naar (aanbeveling, optioneel)". Vink je er één aan, dan verschijnt een vakje voor de reden ("waarom neigen jullie hiernaar?"). Beide zijn niet verplicht. Er kan maar één voorstel aanbevolen zijn. De klant ziet bij dat voorstel een klein label "Onze aanbeveling" en de reden eronder; het voorstel is niet voor-gekozen en staat niet groter of opvallender dan de andere. In de "scripts staan klaar"-mail staat dan een korte zin dat wij bij één voorstel hebben aangegeven waar we naar neigen. De aanbeveling zit in de scriptgeschiedenis van de brief (`recommended` en `reason`), er is geen aparte database-kolom voor.' },
      { type: 'h3', text: 'Als geen voorstel past' },
      { type: 'p', text: 'Onder de voorstellen staat een kleine, bescheiden link "Past geen van deze voorstellen bij je?". De klant kan daar een korte toelichting geven. Wij zetten dat bewust niet in de verf. Wat er gebeurt: de brief krijgt het label **Voorstellen passen niet** in de lijst, er komt een interne notitie bij, en er gaat een Slack-melding uit. In het tabblad Script staat een rood blok met de toelichting, een knop "Mail de klant" en een knop **Voorstellen terugnemen en opnieuw schrijven** (de klant ziet dan weer de wachtpagina totdat je nieuwe voorstellen vrijgeeft).' },
      { type: 'h3', text: 'Scriptcontrole na de bevestiging' },
      { type: 'p', text: 'Past de klant het script of een variatie aan en bevestigt hij daarna alles, dan telt het script nog **niet** als goedgekeurd. De bevestigingsmail zegt dat ook letterlijk (onderwerp: "we hebben je keuzes ontvangen, het script wordt nog gecontroleerd"), en de klant ziet op zijn eindpagina "Je script wordt nog gecontroleerd". Wijzigt de klant na de bevestiging nog iets in het script, dan komt de brief opnieuw in de controle.' },
      { type: 'ul', items: [
        'In de lijst staat een rood label **Script check** bij de bedrijfsnaam, het tabblad Script heeft een rood bolletje en er komt een Slack-melding ("Script check nodig").',
        'In het tabblad Script staat een kaart **Script check** met precies wat de klant heeft veranderd (doorgehaald = weg, goud = erbij) ten opzichte van ons voorstel.',
        '**Akkoord en klant laten weten** zet de controle op akkoord en stuurt de klant een korte mail "je script is akkoord". **Akkoord (zonder mail)** doet hetzelfde stilletjes.',
        '**Tegenvoorstel sturen**: schrijf een toelichting en (optioneel) een voorgestelde tekst. De klant krijgt een mail met een link naar zijn eindpagina, waar hij ons voorstel met één klik kan overnemen of kan reageren. Neemt hij het over, dan wordt de tekst zijn script (ook in de variaties) en staat de controle op akkoord. Reageert hij, dan komt zijn reactie bij jullie in de kaart, in een interne notitie en in Slack, en staat de controle weer open.',
        '**Klant direct mailen** opent een voorbereide e-mail, voor als je het liever buiten de app oplost. Beide routes bestaan dus naast elkaar.',
      ] },
      { type: 'note', text: 'Technisch: de controle-status staat op de brief (`scriptAuditStatus`: leeg, pending, counter, approved of nofit, met `scriptAuditNote`, `scriptCounterText`, `scriptAuditReply`). Of er iets gewijzigd is wordt berekend door `scriptChangesOf` in `components/flowData.js`. De routes staan onder `/api/dashboard/briefs/[id]/script-audit` en `script-reopen` (team) en `/api/briefs/[id]/script-audit` en `no-fit` (klant).' },
    ],
  },
  {
    id: 'dashboard-tabs',
    title: 'Het dashboard, tab voor tab',
    blocks: [
      { type: 'h3', text: 'Dashboard (overzicht)' },
      { type: 'p', text: 'De hoofdpagina: een tabel met alle briefs. Klik op een brief om het detailpaneel te openen, met tabbladen voor Overzicht (klantgegevens + levering), Team (wie is toegewezen, status) en Creatief (script + variaties, met wijzigingen-vergelijking als het script is aangepast).' },
      { type: 'p', text: 'De tabel zelf is aanpasbaar: rechtsboven zit een knop "⚙ Kolommen" waarmee je kunt kiezen welke kolommen zichtbaar zijn (bijv. aantal revisierondes, aantal variaties, wie is toegewezen, hoe lang een brief al open staat). Deze keuze wordt per browser onthouden.' },
      { type: 'p', text: 'Let op voor de tabbladen: in **Overzicht** staan nu ook de impressies en een blok Doelgroep (B2B/B2C/beide, beslisser, leeftijd en interesses, verdeling man/vrouw zoals de klant het typte plus hoe de app het leest). In **Team** is de **live-datum** nu door TFA aan te passen (datumveld): de klant geeft vaak maar een maand op; vul hier de echte datum in zodra die bekend is. Een brief heeft tabbladen in de volgorde van het proces: **Overzicht** (klantgegevens, wat voor bedrijf het is met link naar de website, levering, waar de variaties over gaan), **Team**, **Script**, **Stem & muziek**, **Productie & review** en, zodra de klant goedkeurt, **Uitlevering**. Helemaal achteraan staat **Historie**: het volledige logboek van de brief (rustig weggestopt, alleen voor als je iets wilt terugzoeken). Het tabblad Script toont één voorstel tegelijk met pijltjes om te wisselen (met de variaties van dat voorstel eronder); het aanbevelingsvinkje werkt direct, zonder te wachten. Scripttekst staat overal in het gewone lettertype met een gouden blok. Alles rond het script staat nu in het eigen tabblad **Script** (het stond eerst verstopt onder Creatief): de uitleg over waar de variaties over gaan, het paneel Scriptvoorstellen (nakijken, bewerken, per variatie een eigen tekstvak, opnieuw schrijven, vrijgeven) en daaronder het script zoals de klant dat gekozen heeft, met de variaties. Wacht een brief op jouw nakijken (status "Script nakijken"), dan opent hij direct op het Script-tabblad en staat er in elk tabblad een rode balk "De scripts wachten op jou" met een knop erheen. Na vrijgave heet de status "Klant kiest script".' },
      { type: 'p', text: '**Opruimen zonder iets kwijt te raken.** Boven de lijst staat **Opruimen…**: eerst download je een export (CSV van alle briefs), pas daarna wordt de knop om de briefs in de huidige weergave te **archiveren** actief. Gebruik de periode- en statusfilters en de zoekbalk om precies te kiezen wat er in het archief komt. Er wordt niets verwijderd: via **Archief (n)** bekijk je de gearchiveerde briefs en zet je ze (of één brief via de popup) weer terug. Agentschappen zien gearchiveerde briefs niet.' },
      { type: 'p', text: '**Voorstellen bijsturen.** Onder elk voorstel in het tabblad Script staat "Dit voorstel bijsturen of weghalen". Je kunt **alleen dat ene voorstel opnieuw laten schrijven**, met een eigen opmerking (bijv. "minder commercieel, meer humor"). Die opmerking wordt bovenop de vaste AI-instructie (tabblad AI-prompt) en de briefgegevens meegestuurd; de andere voorstellen blijven staan. Je kunt een voorstel **weghalen** (er blijft er minstens één over) of een **extra voorstel** laten schrijven (maximaal drie). De klant krijgt dus één, twee of drie voorstellen: precies wat je vrijgeeft. De velden groeien mee met de tekst, dus je hoeft ze niet meer te vergroten.' },
      { type: 'p', text: '**Historie.** Het tabblad Historie toont per brief, nieuwste bovenaan, wat de klant en TFA deden: brief verstuurd, voorstellen geschreven/aangepast/vervangen/weggehaald, vrijgegeven, wat de klant koos en goedkeurde (met de volledige tekst erbij, inclusief variaties, onder "Toon volledige tekst"; met één knop klap je alles uit), aanpassingen na bevestiging, scriptcheck (akkoord of tegenvoorstel), bevestiging van stem en muziek, reviewrondes en uitlevering. Elke keer dat voorstellen worden geschreven, vervangen of weggehaald staat de volledige oude en nieuwe tekst erbij, en ook elke aanpassing van de klant aan het script of de variaties (aanpassingen vlak na elkaar worden samengevoegd tot één regel). Dit staat in het veld `eventLog` van de brief (maximaal 400 regels) en komt nooit in de publieke API of bij een agentschap.' },
      { type: 'p', text: '**Wat je moet produceren.** Is de klant klaar, dan staat bovenaan het Script-tabblad het kader **Definitief script om te produceren**: het hoofdscript en daaronder elke variatie als volledige tekst, elk met een knop Kopieer (voor jezelf of de echte stem). De verschillen met het hoofdscript staan ingeklapt. Een variatie volgt altijd het hoofdscript: een wijziging in gedeelde tekst is al in elke variatie verwerkt, dus je hoeft niet 12 keer dezelfde wijziging te sturen. Dat staat ook uitgelegd aan de klant op de script- en variatiepagina. Heeft de klant na bevestiging nog iets aangepast, dan staat er "nog niet definitief" tot jij het hebt gecontroleerd.' },
      { type: 'p', text: '**Opmaak van het dashboard:** het hele beheergedeelte volgt het TFA-ontwerpsysteem (Geist-lettertype, afgeronde knoppen, dunne randen in plaats van schaduwen, zwart als hoofdkleur en goud alleen als accent). Elke pagina begint met dezelfde titel + korte uitleg (`components/PageHeader.js`). De statuskaarten bovenaan hebben een gekleurd bolletje en kleurig getal per status, en lichten goud op bij hover of als filter actief is. De gouden accenten (zijbalk, kaarten, tabbladen) en de gescheiden kaarten in de brief-popup zijn bewust behouden, zodat duidelijk blijft wat waar staat. Tijden staan kort ("11 okt, 12:24"). De brief opent nu als eigen venster over het hele scherm (in plaats van een popup): bovenaan staat "Terug naar dashboard" en met Vorige/Volgende ga je naar de andere klant in de lijst zoals je die gefilterd en gesorteerd hebt; de terugknop van de browser en Esc sluiten het venster ook. Daarvoor was de brief-popup breder, met de status rechtsboven naast het sluitkruisje, het agentschap en de contactpersoon als labels onder de naam, en tabbladen als pillen op één regel (een stipje achter Productie & review en Uitlevering laat de stand zien). Dit geldt alleen voor het beheer; het klantformulier is niet aangepast.' },
      { type: 'h3', text: 'Agentschappen' },
      { type: 'p', text: 'Hier beheer je samenwerkende agentschappen zelf, zonder code. Het bewerkformulier is opgedeeld in vijf blokken (Basis, Toegang, Script en formulier, Branding, Formulier aanpassen) met een vaste Opslaan-balk onderaan: naam, hoofdcode, extra codes, contactadres, logins, scriptmodus, formulierinstellingen en logo\'s. Volledige uitleg staat onder "Agentschappen & toegang" en "Co-branding".' },
      { type: 'h3', text: 'Bibliotheek' },
      { type: 'p', text: 'Hier beheer je de muziektracks en stemmen waar klanten uit kunnen kiezen bij de "Muziek"- en "Stem"-stappen: uploaden, categoriseren, taggen, verwijderen.' },
      { type: 'p', text: '**Playlists beheren.** Op het tabblad Muziek staat bovenaan het blok "Playlists beheren". Daar voeg je een nieuwe playlist toe (bijvoorbeeld Kerst, met optioneel een korte omschrijving), pas je naam en omschrijving aan, en bepaal je met de pijltjes de volgorde waarin klanten de playlists zien. Is het seizoen voorbij, dan klik je op Verbergen: de playlist en de tracks erin verdwijnen voor klanten, maar blijven in de bibliotheek staan en komen terug met Tonen. Verwijderen kan alleen als de playlist leeg is. Een nieuwe naam geeft ook de tracks in die playlist de nieuwe naam.' },
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
        'De zijbalk en layout van alle stappen komt uit `components/StepShell.js`; de stappen-volgorde en teksten uit `components/flowData.js` (daar staan ook de lees-hulpjes voor impressies, man/vrouw-verdeling, doelgroep en live-maand: `parseImpressions`, `parseGenderSplit`, `audienceLabel`, `upcomingMonthOptions`); het laden/opslaan van een brief in de browser uit `components/useBrief.js`.',
      ] },
      { type: 'h3', text: 'Dashboardpagina\'s (login nodig)' },
      { type: 'ul', items: [
        '`/dashboard` (briefs), `/dashboard/agencies`, `/dashboard/library`, `/dashboard/prompt`, `/dashboard/reports`, `/dashboard/help`. Alles behalve het hoofdscherm is alleen voor TFA.',
        'Het hoofdscherm is `components/DashboardClient.js`; de zijbalk met menu (verschilt per rol) is `components/DashboardSidebar.js`; de gedeelde paginatitel is `components/PageHeader.js`; de bewerkblokken in Agentschappen staan in `components/AgenciesClient.js`.',
      ] },
      { type: 'h3', text: 'API-routes (de achterdeur die de pagina\'s aanroepen)' },
      { type: 'ul', items: [
        '`POST /api/briefs` — maakt een nieuwe brief aan, met controle van de toegangscode (zoekt het agentschap op en bevriest de gegevens).',
        '`GET/PATCH /api/briefs/[id]` — brief ophalen of bijwerken door de klant; bij versturen start hier het achtergrond-schrijven van de drafts. Alleen velden uit een vaste lijst (`ALLOWED_FIELDS` in `lib/db.js`) mogen door de klant geschreven worden.',
        '`/api/briefs/[id]/select-script`, `edit`, `resume-link`, `review-approve`, `review-feedback`, `no-fit`, `script-audit` — klantacties: script kiezen, bewerken (met `syncVariations`: de aanpassing wordt in de variaties doorgevoerd, via `lib/scriptSync.js` en `lib/scriptMerge.js`), link mailen, goedkeuren, feedback geven, melden dat geen voorstel past, antwoorden op een tegenvoorstel.',
        '`/api/dashboard/briefs/[id]/...` — `status`, `meta`, `notes`, `delivery`, `review-round`, `pdf`, `scripts` (opnieuw schrijven, eigen script, vrijgeven, draft aanpassen, aanbeveling zetten), `script-audit` (script check: akkoord of tegenvoorstel), `script-reopen` (voorstellen terugnemen), (met `rewrite`, `add` en `remove` per voorstel; de opmerking gaat mee in `lib/scriptgen.js`, regels in `lib/scriptProposals.js`), en `/api/dashboard/briefs/archive` (POST, brieven archiveren of terugzetten, nooit verwijderen; kolom `archivedAt`), en `meta` kan nu ook de live-datum (`airDate`) zetten. Alleen voor TFA, behalve het lezen van een brief door een agentschap dat de brief mag zien.',
        '`/api/dashboard/agencies` (lijst/aanmaken), `/agencies/[id]` (wijzigen/verwijderen; geeft 409 bij dubbele code), `/agencies/logo` (logo uploaden).',
        '`/api/dashboard/prompt-versions`, `/delivery-recipients`, `/reports/export`, `/library/storage` — AI-prompt, bezorgadressen, CSV-export, opslaggebruik.',
        '`/api/library/*` — muziek, stemmen en categorieën beheren en audio uploaden. Playlists (tabel `playlists`: naam, omschrijving, verborgen, volgorde) worden beheerd via server actions in `app/dashboard/library/actions.js` en `components/PlaylistManager.js`; de publieke `categories`- en `tracks`-routes laten verborgen playlists weg. Volgorde en naamregels: `lib/playlistOrder.js`.',
        '`GET /api/health` — gezondheidscheck voor uptime-monitoring: antwoordt `{ok, db, dbMs}` (503 als de database niet reageert). Geen gevoelige gegevens.',
      ] },
      { type: 'h3', text: 'Belangrijkste bestanden in lib/' },
      { type: 'ul', items: [
        '`db.js` — alle data. Werkt met Postgres in productie en met een tijdelijk geheugen tijdens lokaal testen (twee versies van elke functie). Bevat ook de kleine database-aanpassingen (`runMigrations`), die automatisch worden uitgevoerd.',
        '`http.js` (time-outs en begrensde herhaling voor externe aanroepen), `rateLimit.js` (begrenzing publieke acties) en `publicBrief.js` (haalt interne velden uit wat klanten terugkrijgen). Tests staan in `tests/` (`npm test`, `npm run loadtest`).',
        '`access.js` — bepaalt wie je bent (staff/agentschap/anoniem) en welke briefs je mag zien; beschermt alle TFA-only routes en pagina\'s.',
        '`scriptJobs.js` en `scriptJobState.js` (schrijven op de achtergrond; de stand staat in het staff-only veld `scriptJob` van de brief, dat het Script-tabblad elke 3 seconden volgt zolang er een opdracht loopt; een opdracht ouder dan 4 minuten telt als mislukt), `lengthLevel.js` (groen/oranje/rood-grenzen van de lengtemeter, getoond door `components/LengthMeter.js`), `voiceMatch.js` (aanbevolen stemmen plus de rest op leeftijdsnabijheid) en `eventLog.js` (historie met volledige teksten) horen bij de nieuwste functies. `scriptMerge.js` en `scriptSync.js` — passen de aanpassing van de klant op het hoofdscript toe op de variaties (woord voor woord, met behoud van het eigen verschil van elke variatie). `formProfile.js` — verborgen/extra vragen per agentschap. `scriptgen.js` — AI-scripts. `promptVersions.js` — AI-prompt versies. `reports.js` — statistieken.',
        '`email.js` — alle e-mails (incl. gedeelde kop met co-branding). `slack.js` — Slack-berichten. `briefPdf.js` — de PDF van een brief, met agentschapslogo en extra vragen.',
      ] },
      { type: 'h3', text: 'Fasen van een brief' },
      { type: 'p', text: 'invullen, dan schrijven (is ingediend, `submittedAt`), dan kiezen (scripts vrijgegeven, `scriptsReleasedAt`), dan afronden (bevestigd, `finalizedAt`). De functie `briefStageOf` rekent dit uit en wordt overal gebruikt om de juiste pagina en tekst te tonen en om te voorkomen dat een klant een stap te vroeg opent.' },
      { type: 'h3', text: 'Instellingen in Vercel (environment variables)' },
      { type: 'ul', items: [
        '**Database:** `POSTGRES_URL`. **Login:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.',
        '**AI:** `ANTHROPIC_API_KEY` (+ optioneel `ANTHROPIC_MODEL`), `GEMINI_API_KEY`, `OLLAMA_HOST`/`OLLAMA_MODEL`.',
        '**E-mail:** `RESEND_API_KEY`, `SENDER_EMAIL`, `TEAM_NOTIFY_EMAILS`, `ADMIN_NOTIFY_EMAIL`, `ENGINEER_EMAIL_MARCO`, `ENGINEER_EMAIL_KARIM`. **Slack:** `SLACK_WEBHOOK_URL`.',
        '**Toegang:** `TFA_ACCESS_CODE`. **Bestanden:** `BLOB_READ_WRITE_TOKEN` of `BLOB_STORE_ID`. Links in e-mails worden altijd gebouwd uit het adres waarop het verzoek binnenkwam (dus `https://spotflow.tfa.studio` in productie); er is geen aparte instelling voor nodig. `NEXT_PUBLIC_APP_URL` wordt in de code niet gebruikt en hoeft dus niet gezet te worden (een `NEXT_PUBLIC_`-waarde zou bovendien zichtbaar zijn in de browser).',
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
        'Wat een klant via de publieke API terugkrijgt bevat **nooit de interne notities** van TFA (`lib/publicBrief.js` haalt ze eruit). Het uploaden van muziek/stem-bestanden naar de bibliotheek kan alleen als TFA-medewerker (ingelogd).',
        'Publieke acties zijn begrensd tegen misbruik (`lib/rateLimit.js`): nieuwe briefs maximaal 30 per 10 minuten per adres, "mail mij de link" maximaal 5 per 10 minuten per brief, autosave maximaal 600 per minuut. Wie te snel gaat krijgt een nette "even rustig aan"-melding. De teller geldt per serverinstantie (best effort).',
        'Alle verbindingen naar externe diensten (AI, e-mail via Resend, Slack) hebben een time-out (`lib/http.js`); e-mail wordt bij een "probeer later"-antwoord van Resend maximaal twee keer opnieuw geprobeerd, nooit na een time-out, zodat er geen dubbele mails ontstaan.',
        'Beveiligingskoppen (nosniff, X-Frame-Options, Referrer-Policy) staan in `next.config.js`. Bekend: `npm audit` meldt kwetsbaarheden in Next 14 en Clerk 5 waarvoor alleen een grote versie-upgrade een oplossing is; die is bewust niet meegenomen en staat als aandachtspunt in het architectuurrapport.',
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
        'De klant krijgt een bevestigingsmail zodra hij een brief indient ("we zijn aan de slag"). Zodra TFA de scripts vrijgeeft, krijgt hij een tweede mail "je scripts staan klaar" met de link om te kiezen (met een zin over onze aanbeveling als we er een hebben meegegeven). De mail na het bevestigen zegt nu dat het script nog niet definitief goedgekeurd is als de klant het heeft aangepast. Daarna kunnen nog twee mails volgen vanuit de scriptcontrole: "we hebben een voorstel voor je script" en "je script is akkoord". De e-mailkop toont het agentschapslogo als de brief via een agentschap kwam.',
        'Het team (adressen ingesteld via `TEAM_NOTIFY_EMAILS`) krijgt dezelfde soort overzichtsmail, zodat een brief direct ingepland kan worden.',
        'De toegewezen engineer (Marco of Karim, via `ENGINEER_EMAIL_MARCO`/`ENGINEER_EMAIL_KARIM`) krijgt een mail zodra een brief aan hem wordt toegewezen.',
      ] },
      { type: 'h3', text: 'Slack' },
      { type: 'ul', items: [
        '🆕 Nieuwe brief binnen — zodra een klant indient (met het aantal drafts dat op de achtergrond geschreven wordt, of "eigen script" bij een agentschap met eigen copywriter).',
        '👤 Toegewezen — zodra een brief aan iemand wordt toegewezen.',
        '💬 Feedback ontvangen — zodra een klant feedback geeft op een revisieronde in plaats van goed te keuren.',
        '🔎 Script check nodig — de klant bevestigde alles maar paste het script aan. 🙈 Geen van de scriptvoorstellen past — via de bescheiden link onder de voorstellen. ↩️ Klant reageert op ons scriptvoorstel — antwoord op een tegenvoorstel.',
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
        '**22 okt 2026 (later)** — Scripts schrijven draait nu volledig op de achtergrond: een voorstel vervangen, toevoegen of alles opnieuw schrijven start meteen en loopt door, ook als je naar een andere brief gaat of ergens anders klikt. Het resultaat verschijnt vanzelf in het Script-tabblad. Duurt het te lang of lukt het niet, dan staat er een duidelijke melding.',
        '**22 okt 2026** — Lengtemeter voor de klant in drie standen (groen past, oranje iets te lang en TFA controleert, rood te lang: dan kunnen er geen woorden bij en kan de klant niet verder). Stemstap: aanbevolen stemmen bovenaan, daaronder een afgescheiden blok met alle andere stemmen, gesorteerd op leeftijd eerst en dan geslacht. Altijd drie scriptvoorstellen (mislukte voorstellen worden opnieuw geprobeerd) en een duidelijke knop om één voorstel te vervangen. De Historie bewaart nu de volledige teksten, ook van aanpassingen van de klant. De brief opent als venster over het hele scherm met terug naar het dashboard en vorige/volgende klant. Bibliotheek: playlists toevoegen, verbergen (seizoen) en herordenen.',
        '**21 okt 2026** — Overzicht rustiger gemaakt (zelfde indeling en functies): de gekleurde labels onder de bedrijfsnaam zijn weg. Er zijn twee vaste kolommen bijgekomen: **Script** (Brief open, Nakijken, Klant kiest, Wacht op klant, Controleren, Past niet, Akkoord) en **Productie** (Niet gestart, Review verzonden, Feedback, Goedgekeurd, Geleverd), elk met een klein icoon en korte tekst, sorteerbaar, met uitleg bij hover; alleen wat aandacht van TFA vraagt heeft een sterkere kleur. De bedrijfsnaam houdt alleen het gele puntje voor nieuwe briefs, de statuskeuze (To-do, Wacht op klant, enz.) staat neutraal. In het tabblad Script staat het script centraal (leesbare breedte), de gegevens eromheen zijn compact, de losse kaart "Waar gaan de variaties over" is weg (staat nu bij elke variatie), variaties zijn uitklapbaar, en een afgeronde scriptcontrole klapt dicht.',
        '**21 okt 2026** — Scripts nakijken beter: de brief-popup is groter en de tekstvelden groeien mee. Een voorstel kan nu los opnieuw geschreven worden met een eigen opmerking (die aan de AI-prompt wordt toegevoegd), weggehaald of aangevuld worden; de klant krijgt 1, 2 of 3 voorstellen. Stemmen staan altijd alfabetisch. Nieuw tabblad Historie met het volledige logboek per brief, een kader "Definitief script om te produceren" met kopieerknoppen per versie, en uitleg aan de klant dat variaties het hoofdscript volgen. Agentschapslogins krijgen geen interne notities of logboek meer te zien.',
        '**20 okt 2026** — Feedback-ronde beheer en klantflow: in de brief-popup staan de tabbladen in procesvolgorde, de dubbele agency- en contactchips zijn weg en het Overzicht toont wat voor bedrijf het is met een link naar de website (twee nieuwe velden in stap 1: wat voor bedrijf en website). Het tabblad Script toont één voorstel tegelijk met pijltjes, en het aanbevelingsvinkje met reden werkt direct. Variaties tonen bij de klant en in de e-mail alleen wat de klant zelf schreef. Zodra de scripts zijn vrijgegeven zijn Contact, Levering en Brief in de zijbalk afgerond en vergrendeld (aanpassen kan nog via het overzicht). Stem: de terug-link op de stemkeuze gaat nu naar de stemvoorkeuren, een leeftijdsfilter werkt ook zonder geslachtsvoorkeur (voorheen verschenen dan ook 55+-stemmen bij 18-34) en er staat een hint voor klanten die het niet weten. Muziek: moderne speler met voortgangsbalk en nieuwe tekst (wij adviseren één track, bij twijfel maximaal drie en TFA kiest er één). Het logo van een agentschap verschijnt onder de loader alleen voor klanten met een agentschapscode en voor ingelogde agentschapsgebruikers. Nieuw: Opruimen met export en archief (met terugzetten).',
        '**20 okt 2026** — Duidelijkere weg terug voor klanten: in de zijbalk staan nu "Naar de homepage" en "Nieuwe brief starten" (op telefoon een kleine knop "Homepage" rechtsboven), naast het logo. Vanaf stap 2 verschijnt altijd dezelfde waarschuwing: de voortgang is al opgeslagen, met de knop "Kopieer link om later verder te gaan" of toch weggaan. "Nieuwe brief starten" gaat naar /start met de agentschapscode van de brief al ingevuld; de oude brief blijft bewaard onder zijn link. Op stap 1 is er niets te verliezen, daar gaat het direct.',
        '**20 okt 2026** — Architectuur-ronde (functioneel ongewijzigd): interne notities lekken niet meer via de publieke brief-API, upload-token voor de bibliotheek alleen voor ingelogd TFA, time-outs op alle externe aanroepen (AI, Resend, Slack) met begrensde herhaling voor e-mail, begrenzing van publieke acties, database-migraties draaien nu één keer tegelijk en er zijn extra indexen, nieuwe gezondheidscheck `/api/health` voor uptime-monitoring, beveiligingskoppen, en geautomatiseerde tests (`npm test`) plus een belastingtest (`npm run loadtest`).',
        '**20 okt 2026** — Opmaak opgeschoond (geen functionele wijzigingen): gedeelde ontwerpwaarden (kleuren, hoekradius) als CSS-variabelen, compactere statuskaarten (op mobiel drie naast elkaar), tabblad Overzicht in de brief-popup beter in balans (agency bij Contact, op de radio en impressies naast elkaar, aangemaakt/verzonden als rustige regel, doelgroep in twee kolommen), minimale lettergrootte van 11px in het beheer, en iets meer ruimte tussen de doelgroepvelden in het klantformulier (het formulier blijft de volle breedte vullen). Wie "verminderde beweging" aan heeft staan, ziet minder animaties.',
        '**20 okt 2026** — Feedback uit de AdVision-test verwerkt: (1) impressies is een open veld dat ook `500k` of `1,5 miljoen` begrijpt; (2) live-datum: ook maanden volgend jaar, en TFA kan de definitieve datum later zelf instellen (tabblad Team); (3) doelgroep: B2B, B2C of beide (met keuze één commercial of verschil in de variaties) en een veld man/vrouw-verdeling (`man / vrouw - 30 / 70`); (4) scripttekst in het gewone lettertype met een opvallend blok in plaats van het schreefletter-lettertype; (5) een aanpassing aan het gekozen script wordt nu ook doorgevoerd in de variaties; (6) TFA kan een aanbeveling (met reden) meegeven bij de voorstellen; (7) een bescheiden link voor als geen voorstel past; (8) scriptcontrole na bevestiging, met akkoord of tegenvoorstel in de app, en aangepaste e-mailteksten (het script is niet definitief goedgekeurd zolang TFA de aanpassingen niet heeft gecontroleerd). Ook de uitleg over `NEXT_PUBLIC_APP_URL` onder de motorkap is gecorrigeerd.',
        '**11 okt 2026** — Opmaak beheerdeel opgeschoond volgens het TFA-ontwerpsysteem: rustigere titels (Geist), statuskaarten met gekleurd bolletje, bredere brief-popup met tabbladen op één regel en de status rechtsboven; de gouden gloed/hover-accenten en de gescheiden gekleurde kaarten zijn behouden of versterkt, kortere tijden, Agentschappen-formulier in blokken met vaste Opslaan-balk, betere contrasten en zichtbare focusranden. Geen functionele wijzigingen; alleen het beheer, niet het klantdeel.',
        '**10 okt 2026** — Variaties: de Brief-stap vraagt nu waar elke variatie over gaat (vestiging/website/aanbod/uitzendperiode + toelichting + optioneel wanneer). De AI schrijft per voorstel ook de variatietekst(en); de toelichting staat in dashboard, klantoverzicht, e-mail en PDF. Dashboard: nieuw tabblad **Script** met alle scriptzaken (voorheen onder Creatief, dat nu Stem & muziek heet) en een waarschuwingsbalk als scripts wachten op nakijken. Klant-scriptpagina: aparte kleine knop "Aanpassing opslaan" en een grote knop die alleen goedkeurt en verder gaat; de dubbele "bekijk variatie"-knop is weg.',
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
