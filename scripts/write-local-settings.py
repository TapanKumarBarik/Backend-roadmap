#!/usr/bin/env python3
"""Write api/local.settings.json from the live Azure app settings.

    python scripts/write-local-settings.py

Reads the deployed Static Web App's application settings via the Azure CLI and
writes them to api/local.settings.json, which `func start` reads. Values are
never printed -- the script reports only which keys it found, so running it
does not leave your storage key or client secret in a terminal transcript,
a screen share, or a CI log.

You need to be logged in first:  az login

SECURITY
    This puts production credentials on your disk in plaintext. That is what
    local development against real data costs, but be aware of it:
      - api/local.settings.json is gitignored. Do not force-add it.
      - Delete it when you are done if this machine is shared.
      - If it ever leaks, rotate the storage key first: it is the one that
        also invalidates every SAS token issued from it.

Two values are deliberately NOT copied verbatim:
    SITE_ORIGINS  is overridden to http://localhost:4173, because that is the
                  redirect URI registered with Google for local development.
    GOOGLE_*      are trimmed. The portal copies carry a trailing carriage
                  return from a Windows paste, and an untrimmed client id
                  fails the claims.aud equality check in auth.js.
"""
import json
import os
import subprocess
import sys

SWA_NAME = 'swa-backend-roadmap'
RESOURCE_GROUP = 'rg-backend-roadmap'
LOCAL_ORIGIN = 'http://localhost:4173'

# Everything the Functions host needs to serve the app locally. Anything the
# deployment has that isn't listed here is left out on purpose.
WANTED = [
    'TABLE_STORAGE_CONNECTION_STRING',
    'SESSION_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'IMAGES_CONTAINER_SAS',
    'FEED_CONTAINER_SAS',
    'BACKUPS_CONTAINER_SAS',
    'GITHUB_PAT',
    'APPLICATIONINSIGHTS_CONNECTION_STRING',
]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, 'api', 'local.settings.json')


def fetch():
    cmd = [
        'az', 'staticwebapp', 'appsettings', 'list',
        '--name', SWA_NAME, '--resource-group', RESOURCE_GROUP, '-o', 'json',
    ]
    try:
        # stderr is swallowed rather than forwarded: az error output can echo
        # the request, and this command's payload is entirely secrets.
        out = subprocess.run(
            cmd, capture_output=True, text=True, shell=(os.name == 'nt')
        )
    except FileNotFoundError:
        sys.exit('az CLI not found. Install it, then run: az login')
    if out.returncode != 0:
        sys.exit('az failed (exit %d). Are you logged in? Try: az login' % out.returncode)
    try:
        return json.loads(out.stdout).get('properties', {})
    except (ValueError, AttributeError):
        sys.exit('could not parse the settings az returned')


def main():
    props = fetch()
    if not props:
        sys.exit('no application settings came back for %s' % SWA_NAME)

    values = {
        'FUNCTIONS_WORKER_RUNTIME': 'node',
    }
    report = []
    for name in WANTED:
        raw = props.get(name)
        if raw is None:
            report.append((name, 'MISSING'))
            continue
        clean = raw.strip()
        values[name] = clean
        report.append((name, 'set' + (' (trimmed)' if clean != raw else '')))

    # The timer trigger's schedule monitor needs a real storage account or the
    # host reports itself unhealthy on every start. Same account.
    if 'TABLE_STORAGE_CONNECTION_STRING' in values:
        values['AzureWebJobsStorage'] = values['TABLE_STORAGE_CONNECTION_STRING']

    values['SITE_ORIGINS'] = LOCAL_ORIGIN

    doc = {'IsEncrypted': False, 'Values': values, 'Host': {'CORS': '*'}}
    with open(TARGET, 'w', encoding='utf-8') as fh:
        fh.write(json.dumps(doc, indent=2) + '\n')

    print('wrote %s' % os.path.relpath(TARGET, os.getcwd()))
    for name, state in report:
        print('  %-42s %s' % (name, state))
    print('  %-42s %s (local override)' % ('SITE_ORIGINS', LOCAL_ORIGIN))
    if any(state == 'MISSING' for _, state in report):
        print('\nSome keys were missing. The app may still start, but the '
              'features that need them will fail.')


if __name__ == '__main__':
    main()
