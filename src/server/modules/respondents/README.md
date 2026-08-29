# Respondents module

Owns public sessions and respondent identity plus the Phase 10 internal PII
interface. Public flows never accept a respondent reference ID as a credential.

Internal list, exact reference search, and detail reads authorize Researcher or
Admin before repository access, decrypt name/phone only on the server, return an
allowlisted PII DTO with private/no-store caching, and write PII-free audit
events. Product Managers have no internal respondent route or navigation.

Respondent-level answers and XLSX generation remain outside this boundary until
their approved export phase.
