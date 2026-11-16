# Taxi Planner ↔ ChauffeursHub — testkoppeling

Deze map bevat het openbare **testcontract** voor de koppeling tussen Taxi Planner V1053 en ChauffeursHub.

## Huidige testarchitectuur

- ChauffeursHub V10 haalt de vaste fictieve opdracht op via de Vercel API.
- De API bewaart de demo-opdracht en terugmeldingen in een **private Vercel Blob-store**.
- De chauffeur kan voor een teststop `picked` (opgehaald) of `absent` (niet aanwezig) terugmelden.
- Taxi Planner V1053 toont de ontvangen demo-statussen in een apart testpaneel.
- De bestaande routeplanning en echte rit-/kindgegevens worden door deze testkoppeling niet gewijzigd.

## Privacy en begrenzing

- De API accepteert uitsluitend `environment: "demo"` en de vaste ritcode `DEMO-EMMEN-001`.
- Alleen de twee fictieve teststops uit `ritten-demo.json` worden geaccepteerd.
- De demo-API is bewust een openbare proefinterface en is **niet geschikt voor echte persoonsgegevens of productiegebruik**.
- De CORS-regel beperkt browsergebruik tot de GitHub Pages-origin, maar CORS is geen authenticatie.
- Voor productie zijn chauffeur-login, persoonlijke tokens/PIN-verificatie, planner-autorisatie, logging en passende bewaartermijnen nodig.
- Plaats nooit echte kindnamen, woonadressen, telefoonnummers, oudergegevens, medische of veiligheidsnotities in deze openbare repository.

## V1 gegevenscontract

Een rit bevat:
- `schemaVersion`: versie van het contract.
- `tripId`: unieke ritcode.
- `serviceDate`: datum in YYYY-MM-DD.
- `driverId` en `driverName`: chauffeurkoppeling.
- `stops[]`: geordende stops met een pseudoniem `stopId`, testadres en geplande tijd.
- `destination`: school/eindbestemming.
- `status`: `waiting`, `picked`, `absent` of `school`.

## V2 terugmeldingen

ChauffeursHub stuurt statusgebeurtenissen terug: `picked`, `absent`, `delay` en `school`, met `tripId`, `stopId` en tijdstip. De huidige demo-interface toont `picked` en `absent` als eerste teststappen. De planner leest de statussen alleen in een afzonderlijk testpaneel; er worden nog geen echte ritten aangepast.

## Testen

1. Open ChauffeursHub V10 en laad de demo-opdracht.
2. Bereken de route.
3. Meld bij een teststop `Kind opgehaald` of `Kind niet aanwezig`.
4. Open Taxi Planner V1053 en kies `Status ophalen uit ChauffeursHub` in het testpaneel.
5. Controleer of de demo-status en het aantal terugmeldingen zijn bijgewerkt.

De waarden zijn fictief en bedoeld om de technische gegevensstroom te controleren.
