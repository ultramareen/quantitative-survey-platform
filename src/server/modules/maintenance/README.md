# Maintenance module

Controlled-machine backup archive protection, isolated restore verification,
and operational recovery helpers live here. This module has no HTTP or client
entry point. It uses separate backup/restore/maintenance credentials and must
not be constructed by ordinary application request runtimes.
