# PowerShell script to generate Supabase types
# Make sure you're logged in: npx supabase login
# And linked: npx supabase link --project-ref vgdycmpevjiyfjrbskxf

Write-Host "Generating Supabase types..." -ForegroundColor Cyan

# Try linked project first
$linkedResult = npx supabase gen types typescript --linked > src/lib/supabase.types.ts 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Linked project failed, trying with project-id..." -ForegroundColor Yellow
    npx supabase gen types typescript --project-id vgdycmpevjiyfjrbskxf > src/lib/supabase.types.ts 2>&1
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Types generated successfully to src/lib/supabase.types.ts" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to generate types. Make sure you're logged in: npx supabase login" -ForegroundColor Red
    exit 1
}



