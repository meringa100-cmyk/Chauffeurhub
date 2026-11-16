# Taxi Planner ↔ ChauffeursHub — testkoppeling

Deze map bevat het openbare **testcontract** voor de eerste koppeling tussen Taxi Planner V1053 en ChauffeursHub.

## Privacy en status

- Alleen synthetische testgegevens zijn toegestaan in deze openbare repository.
- Plaats hier nooit echte kindnamen, woonadressen, telefoonnummers, oudergegevens, medische of veiligheidsnotities.
- Dit bestand is een testfixture; het is geen live database.
- GitHub Pages kan JSON uitleveren, maar kan vanuit een browserapp niet veilig wijzigingen ontvangen. Voor live terugmeldingen is een server-side endpoint nodig. Er komt geen GitHub-token in HTML of JavaScript.

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

ChauffeursHub stuurt later alleen statusgebeurtenissen terug: `picked`, `absent`, `school` en `delay`, met `tripId`, `stopId` en tijdstip. De planner past alleen de betreffende stopstatus aan; routeplanning blijft buiten de integratielaag.

## Testen

Gebruik `ritten-demo.json` als voorbeeld. De waarden zijn fictief en bedoeld om het gegevenscontract te controleren.
