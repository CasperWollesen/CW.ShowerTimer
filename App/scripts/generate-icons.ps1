Add-Type -AssemblyName System.Drawing
$taskIconDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/icons'))
[IO.Directory]::CreateDirectory($taskIconDirectory) | Out-Null
foreach ($taskIconSpec in @(@('icon-192.png',192), @('icon-512.png',512), @('maskable-512.png',512), @('apple-touch-icon.png',180))) {
    $taskIconSize = [int]$taskIconSpec[1]
    $taskBitmap = New-Object Drawing.Bitmap $taskIconSize,$taskIconSize
    $taskGraphics = [Drawing.Graphics]::FromImage($taskBitmap)
    $taskGraphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $taskGraphics.Clear([Drawing.ColorTranslator]::FromHtml('#10191e'))
    $taskScale = $taskIconSize / 100.0
    $taskGraphics.ScaleTransform($taskScale,$taskScale)
    $taskPath = New-Object Drawing.Drawing2D.GraphicsPath
    $taskPath.AddBezier(50,20,43,33,29,46,29,60)
    $taskPath.AddBezier(29,60,29,88,71,88,71,60)
    $taskPath.AddBezier(71,60,71,46,57,33,50,20)
    $taskBrush = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#8ce4ce'))
    $taskGraphics.FillPath($taskBrush,$taskPath)
    $taskPen = New-Object Drawing.Pen ([Drawing.ColorTranslator]::FromHtml('#24594f')),4
    $taskPen.StartCap = 'Round'; $taskPen.EndCap = 'Round'
    $taskGraphics.DrawArc($taskPen,37,51,25,23,95,78)
    $taskBitmap.Save((Join-Path $taskIconDirectory $taskIconSpec[0]),[Drawing.Imaging.ImageFormat]::Png)
    $taskPen.Dispose(); $taskBrush.Dispose(); $taskPath.Dispose(); $taskGraphics.Dispose(); $taskBitmap.Dispose()
}
