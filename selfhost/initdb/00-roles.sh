#!/bin/sh
# Runs once, when the Postgres volume is first created.
set -eu
psql -v ON_ERROR_STOP=1 -U postgres -d postgres -v auth_pw="$AUTHENTICATOR_PASSWORD" -f /selfhost/sql/roles.sql
