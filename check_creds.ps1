try {
    $output = cmdkey /list 2>&1
    Write-Host $output
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
