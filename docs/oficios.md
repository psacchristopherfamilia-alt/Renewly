# Correos para confirmar requisitos con las oficinas

El brief pide confirmar **por escrito** con cada oficina qué documentos, formato, medio y tipo de firma aceptan antes de dar por definitivo el flujo de renovación. Hasta tener esas respuestas, Renewly marca la lista de documentos como **provisional** (`license_types.templates_confirmed = false`).

Cuando respondan:
1. Ajusta `requirement_templates` y `renewal_questions` con lo que digan (una migración nueva).
2. Pon `templates_confirmed = true` para ese tipo de licencia.
3. Si confirman la fecha del 2 de diciembre, pon `rules_confirmed = true` en `license_types` para alojamiento.

---

## 1. Department of Tourism Regulations (licencia de alojamiento)

**Para:** Department of Tourism Regulations (teléfono publicado: 338-5349; pide el correo oficial para trámites)
**Asunto:** Accommodation licence renewal – requirements and accepted format

> Dear Department of Tourism Regulations,
>
> I am preparing accommodation licence renewals for property owners and managers in the Turks and Caicos Islands and would like to make sure we submit exactly what the Department needs. Could you please confirm in writing:
>
> 1. The deadline to request the renewal of an accommodation licence that expires on 31 December, and whether 2 December is still the date for the 2026 cycle.
> 2. The complete list of documents required for a renewal, and any documents required only in specific cases (for example: properties with a pool, change of owner, change in the number of rooms or units).
> 3. Whether renewals are filed online (and at which address), by email, or in person, and the official form to use.
> 4. The accepted file formats (PDF, photos), maximum sizes, and whether an electronic signature is accepted or an original signature is required.
> 5. Whether a property manager may file on behalf of the owner, and what authorisation is needed.
> 6. How the renewal fee is paid and what receipt or reference the applicant receives.
>
> Thank you for your help.
>
> Kind regards,
> [Nombre] · [Empresa] · [Teléfono]

---

## 2. Inland Revenue Department (licencia comercial)

**Para:** Inland Revenue Department – Business Licensing
**Asunto:** Business licence renewal – requirements, format and e-Services integration

> Dear Inland Revenue Department,
>
> We help businesses in the Turks and Caicos Islands keep their business licences up to date and prepare their renewals, which the business then files itself on the Business Licence e-Services portal. Could you please confirm in writing:
>
> 1. The documents required to renew a business licence, and any that apply only in specific cases (for example: businesses with employees, sale of alcohol, change of premises).
> 2. The renewal window and the suspension and cancellation dates for the 2027 cycle.
> 3. Accepted file formats and whether electronic signatures are accepted.
> 4. Whether a representative may file on behalf of a business, and what authorisation is required.
>
> We would also like to ask whether the Department offers, or would consider, an official integration (API or data-exchange agreement) for the e-Services portal. Our goal is to let a business review its renewal and press "Confirm and submit" from our system, with the business's explicit consent before every submission and no storage of portal passwords. We would be glad to follow any security or approval process the Department requires.
>
> Thank you for your time.
>
> Kind regards,
> [Nombre] · [Empresa] · [Teléfono]
