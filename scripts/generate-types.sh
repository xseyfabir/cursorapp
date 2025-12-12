#!/bin/bash
# Script to generate Supabase types
# Make sure you're logged in: npx supabase login
# And linked: npx supabase link --project-ref vgdycmpevjiyfjrbskxf

echo "Generating Supabase types..."

# Try linked project first, then fallback to project-id
npx supabase gen types typescript --linked > src/lib/supabase.types.ts 2>&1

if [ $? -ne 0 ]; then
  echo "Linked project failed, trying with project-id..."
  npx supabase gen types typescript --project-id vgdycmpevjiyfjrbskxf > src/lib/supabase.types.ts 2>&1
fi

if [ $? -eq 0 ]; then
  echo "✓ Types generated successfully to src/lib/supabase.types.ts"
else
  echo "✗ Failed to generate types. Make sure you're logged in: npx supabase login"
  exit 1
fi

