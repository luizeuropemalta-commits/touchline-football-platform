# Architecture Rules

Version: 0.1  
Author: Touchline Executive Documentation Board  
Last Updated: 2026-06-26  
Status: Active  
Dependencies: 07_Architecture, 08_Database, 10_Security  
Future Related Documents: System Architecture, Scaling Plan, Search Architecture

## Rules

1. Do not build features without clear user workflow ownership.
2. Do not duplicate major workflows across multiple pages.
3. Search must become a central platform service, not scattered page logic.
4. External provider logic must stay server-side.
5. Provider-specific code must be isolated behind adapters.
6. Database tables must track source, status and last updated date when storing external references.
7. Sensitive data must never be exposed to the frontend.
8. Every production workflow must have loading, empty and error states.
9. Every route must have a clear permission model.
10. Architecture decisions must be documented before major rebuilds.

