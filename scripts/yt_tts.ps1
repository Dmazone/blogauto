param(
    [Parameter(Mandatory)][string]$Text,
    [Parameter(Mandatory)][string]$OutFile,
    [int]$Rate = 1
)
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice("Microsoft Heami Desktop")
$synth.Rate   = $Rate
$synth.Volume = 100
$synth.SetOutputToWaveFile($OutFile)
$synth.Speak($Text)
$synth.Dispose()
