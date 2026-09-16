from pathlib import Path

path = Path('functions/index.js')
source = path.read_text(encoding='utf-8')

old_import = "const admin = require('firebase-admin');\n"
new_import = "const { initializeApp } = require('firebase-admin/app');\nconst { getFirestore, FieldValue } = require('firebase-admin/firestore');\n"
if source.count(old_import) != 1:
    raise SystemExit(f'expected one legacy admin import, found {source.count(old_import)}')
source = source.replace(old_import, new_import, 1)

old_init = "admin.initializeApp();\nconst db = admin.firestore();"
new_init = "initializeApp();\nconst db = getFirestore();"
if source.count(old_init) != 1:
    raise SystemExit(f'expected one legacy admin init block, found {source.count(old_init)}')
source = source.replace(old_init, new_init, 1)

old_field = 'admin.firestore.FieldValue.serverTimestamp()'
if source.count(old_field) != 2:
    raise SystemExit(f'expected two legacy FieldValue calls, found {source.count(old_field)}')
source = source.replace(old_field, 'FieldValue.serverTimestamp()')

if "require('firebase-admin')" in source or 'admin.firestore' in source or 'admin.initializeApp' in source:
    raise SystemExit('legacy admin namespace usage remains')

path.write_text(source, encoding='utf-8')
print('Firebase Admin 14 modular migration applied')
