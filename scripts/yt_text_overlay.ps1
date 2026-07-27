param(
    [Parameter(Mandatory)][string]$InputPng,
    [Parameter(Mandatory)][string]$OutputPng,
    [string]$TopText   = '',
    [string]$MainText  = '',
    [string]$SubText   = ''
)

Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile($InputPng)
$g   = [System.Drawing.Graphics]::FromImage($img)
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

$W = $img.Width   # 1080
$H = $img.Height  # 1920

# ── 상단 배너 (어두운 오버레이) ─────────────────────────────────────────────
if ($TopText) {
    $topFont   = New-Object System.Drawing.Font("Malgun Gothic", 50, [System.Drawing.FontStyle]::Bold)
    $bannerH   = 220
    $topBrush  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 0, 0, 0))
    $g.FillRectangle($topBrush, 0, 0, $W, $bannerH)

    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $fmt        = New-Object System.Drawing.StringFormat
    $fmt.Alignment     = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString($TopText, $topFont, $whiteBrush, [System.Drawing.RectangleF]::new(0, 0, $W, $bannerH), $fmt)

    $topFont.Dispose(); $topBrush.Dispose(); $whiteBrush.Dispose()
}

# ── 하단 배너 (빨간 오버레이) ────────────────────────────────────────────────
if ($MainText -or $SubText) {
    $bannerTop = 1390
    $bannerH2  = $H - $bannerTop

    $redBrush  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(210, 187, 0, 0))
    $g.FillRectangle($redBrush, 0, $bannerTop, $W, $bannerH2)
    $redBrush.Dispose()

    $fmt2 = New-Object System.Drawing.StringFormat
    $fmt2.Alignment     = [System.Drawing.StringAlignment]::Center
    $fmt2.LineAlignment = [System.Drawing.StringAlignment]::Near

    if ($MainText) {
        $mainFont  = New-Object System.Drawing.Font("Malgun Gothic", 58, [System.Drawing.FontStyle]::Bold)
        $mainBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $mainRect  = [System.Drawing.RectangleF]::new(20, $bannerTop + 40, $W - 40, 160)
        $g.DrawString($MainText, $mainFont, $mainBrush, $mainRect, $fmt2)
        $mainFont.Dispose(); $mainBrush.Dispose()
    }

    if ($SubText) {
        $subFont  = New-Object System.Drawing.Font("Malgun Gothic", 48, [System.Drawing.FontStyle]::Bold)
        $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Yellow)
        $subRect  = [System.Drawing.RectangleF]::new(20, $bannerTop + 230, $W - 40, 140)
        $g.DrawString($SubText, $subFont, $subBrush, $subRect, $fmt2)
        $subFont.Dispose(); $subBrush.Dispose()
    }

    # 트렌드줌 워터마크
    $wmFont  = New-Object System.Drawing.Font("Malgun Gothic", 28, [System.Drawing.FontStyle]::Regular)
    $wmBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(160, 255, 255, 255))
    $wmRect  = [System.Drawing.RectangleF]::new(0, $H - 80, $W, 60)
    $fmt3 = New-Object System.Drawing.StringFormat
    $fmt3.Alignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("TrendZoom.kr", $wmFont, $wmBrush, $wmRect, $fmt3)
    $wmFont.Dispose(); $wmBrush.Dispose()
}

$g.Dispose()
$img.Save($OutputPng, [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
Write-Host "텍스트 오버레이 완료: $OutputPng"
