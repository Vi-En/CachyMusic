' CachyMusic Windows Silent Launcher
' Starts CachyMusic desktop player without showing a console command prompt window

Set WshShell = CreateObject("WScript.Shell")
strPath = WshShell.CurrentDirectory
WshShell.Run "cmd /c """ & strPath & "\cachymusic.bat""", 0, False
Set WshShell = Nothing

