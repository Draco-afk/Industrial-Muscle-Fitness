# ตัวเฝ้าตู้บริการตนเอง
#
# เปิด Chrome โหมด kiosk แล้วเฝ้าไว้ ถ้า Chrome ปิดไปด้วยเหตุใดก็ตาม
# (ลูกค้ากด Alt+F4, Chrome แครช, Windows ฆ่าโปรเซสเพราะหน่วยความจำเต็ม)
# ให้เปิดขึ้นมาใหม่ทันที ลูกค้าจะไม่มีวันเห็นหน้าจอ Windows ของตู้
#
# วิธีใช้: สร้าง shortcut ของไฟล์นี้ไว้ใน shell:startup
#          ดูขั้นตอนเต็มใน README.md ในโฟลเดอร์เดียวกัน

$ErrorActionPreference = 'Stop'

$Url        = 'https://industrial-muscle-fitness.web.app/kiosk/'
$ProfileDir = Join-Path $env:LOCALAPPDATA 'ImfKiosk\chrome-profile'
$LogFile    = Join-Path $env:LOCALAPPDATA 'ImfKiosk\watchdog.log'

# หา Chrome จากที่ที่มันติดตั้งได้จริง แทนที่จะเดาทางเดียว
$ChromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$Chrome = $ChromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Chrome) { throw 'หา chrome.exe ไม่เจอ กรุณาติดตั้ง Google Chrome ก่อน' }

New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null

function Write-Log([string]$Message) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

$ChromeArgs = @(
  '--kiosk', $Url
  # โปรไฟล์แยกของตู้ ไม่ปนกับของพนักงาน และล้างทิ้งได้โดยไม่กระทบอย่างอื่น
  "--user-data-dir=$ProfileDir"
  # ถ้าไม่ปิดสามอย่างนี้ พอ Chrome แครชรอบหนึ่ง รอบต่อไปจะขึ้นแถบ
  # "Chrome ปิดไม่เรียบร้อย" ค้างอยู่กลางจอ ซึ่งลูกค้าปิดเองไม่เป็น
  '--disable-session-crashed-bubble'
  '--disable-infobars'
  '--noerrdialogs'
  '--no-first-run'
  '--no-default-browser-check'
  # หน้าเว็บเป็นภาษาไทย Chrome จะเด้งถามว่าจะแปลไหมทุกครั้งถ้าไม่ปิด
  '--disable-features=Translate,TranslateUI'
  # ปัดนิ้วซ้ายขวาบนจอสัมผัส = กดย้อนกลับ ลูกค้าจะหลุดออกจากหน้าโดยไม่ตั้งใจ
  '--overscroll-history-navigation=0'
  '--disable-pinch'
  # ตู้ไม่มีคนคอยกดอนุญาต จึงไม่ควรมีอะไรมาขอสิทธิ์
  '--deny-permission-prompts'
)

Write-Log "เริ่มตัวเฝ้า ใช้ $Chrome"

while ($true) {
  try {
    $p = Start-Process -FilePath $Chrome -ArgumentList $ChromeArgs -PassThru
    Write-Log "เปิด Chrome แล้ว PID $($p.Id)"
    $p.WaitForExit()
    Write-Log "Chrome ปิดลง (exit $($p.ExitCode)) กำลังเปิดใหม่"
  } catch {
    Write-Log "เปิดไม่สำเร็จ: $($_.Exception.Message)"
  }
  # หน่วงสั้น ๆ กันวนรัวถ้า Chrome เปิดแล้วตายทันทีซ้ำ ๆ
  Start-Sleep -Seconds 3
}
