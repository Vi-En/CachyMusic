#!/usr/bin/env python3
"""Bounded subprocess supervisor for the Windows source launcher.
No shell. On Windows the helper joins a kill-on-close Job Object *before*
creating any child. PHP receives only a bounded, framed result. The POSIX
implementation exists for portable protocol tests, not as a replacement for
PHP's native POSIX pipe runner.
"""
import math
import os
import signal
import struct
import subprocess
import sys
import threading
import time


def attach_windows_job():
    if os.name != 'nt':
        return True
    import ctypes as c
    from ctypes import wintypes as w
    class BasicLimits(c.Structure):
        _fields_ = [('PerProcessUserTimeLimit', c.c_int64), ('PerJobUserTimeLimit', c.c_int64),
                    ('LimitFlags', w.DWORD), ('MinimumWorkingSetSize', c.c_size_t),
                    ('MaximumWorkingSetSize', c.c_size_t), ('ActiveProcessLimit', w.DWORD),
                    ('Affinity', c.c_size_t), ('PriorityClass', w.DWORD), ('SchedulingClass', w.DWORD)]
    class IoCounters(c.Structure):
        _fields_ = [(name, c.c_uint64) for name in ('ReadOperationCount', 'WriteOperationCount',
                    'OtherOperationCount', 'ReadTransferCount', 'WriteTransferCount', 'OtherTransferCount')]
    class ExtendedLimits(c.Structure):
        _fields_ = [('BasicLimitInformation', BasicLimits), ('IoInfo', IoCounters),
                    ('ProcessMemoryLimit', c.c_size_t), ('JobMemoryLimit', c.c_size_t),
                    ('PeakProcessMemoryUsed', c.c_size_t), ('PeakJobMemoryUsed', c.c_size_t)]
    api = c.WinDLL('kernel32', use_last_error=True)
    api.CreateJobObjectW.argtypes = [c.c_void_p, w.LPCWSTR]
    api.CreateJobObjectW.restype = w.HANDLE
    api.SetInformationJobObject.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD]
    api.SetInformationJobObject.restype = w.BOOL
    api.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
    api.AssignProcessToJobObject.restype = w.BOOL
    api.GetCurrentProcess.argtypes = []
    api.GetCurrentProcess.restype = w.HANDLE
    api.CloseHandle.argtypes = [w.HANDLE]
    api.CloseHandle.restype = w.BOOL
    handle = api.CreateJobObjectW(None, None)
    if not handle:
        return False
    limits = ExtendedLimits()
    limits.BasicLimitInformation.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if not api.SetInformationJobObject(handle, 9, c.byref(limits), c.sizeof(limits)) or not api.AssignProcessToJobObject(handle, api.GetCurrentProcess()):
        api.CloseHandle(handle)
        return False
    # Deliberately keep this non-inheritable OS handle until process exit.
    # Closing it explicitly now would terminate this helper and its descendants.
    return True


def terminate(child):
    try:
        if os.name == 'nt':
            child.kill()
        else:
            os.killpg(child.pid, signal.SIGKILL)
    except OSError:
        pass
    try:
        child.wait(timeout=.5)
    except (OSError, subprocess.TimeoutExpired):
        pass


def run(args, cap, timeout):
    deadline = time.monotonic() + timeout
    child = subprocess.Popen(args, stdin=sys.stdin.buffer, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             close_fds=True, start_new_session=os.name != 'nt',
                             creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    buffers = [bytearray(), bytearray()]
    failed = threading.Event()
    def drain(pipe, out):
        try:
            while True:
                block = pipe.read1(min(65536, cap-len(out)+1))
                if not block:
                    return
                if len(out)+len(block) > cap:
                    failed.set()
                    return
                out.extend(block)
        except (OSError, ValueError):
            failed.set()
    threads = [threading.Thread(target=drain, args=(pipe, buf), daemon=True)
               for pipe, buf in zip((child.stdout, child.stderr), buffers)]
    for thread in threads:
        thread.start()
    while True:
        if failed.is_set() or time.monotonic() >= deadline:
            terminate(child)
            return 125
        code = child.poll()
        if code is not None and not any(thread.is_alive() for thread in threads):
            if failed.is_set():
                return 125
            for pipe in (child.stdout, child.stderr):
                pipe.close()
            out, err = buffers
            output = sys.stdout.buffer
            output.write(struct.pack('!4sIII', b'CMP1', code & 0xffffffff, len(out), len(err)))
            output.write(out)
            output.write(err)
            output.flush()
            return 0
        failed.wait(min(.01, max(0, deadline-time.monotonic())))


def main():
    if not sys.stdin or not sys.stdout or not attach_windows_job():
        return 125
    if sys.argv[1:] == ['--probe']:
        print('CMP1', flush=True)
        return 0
    try:
        if len(sys.argv) < 5 or sys.argv[3] != '--':
            return 125
        cap, timeout = int(sys.argv[1]), float(sys.argv[2])
        if not 0 <= cap <= 67108864 or not math.isfinite(timeout) or not 0 < timeout <= 300:
            return 125
        args = sys.argv[4:]
        if not args[0] or any('\0' in arg for arg in args):
            return 125
        return run(args, cap, timeout)
    except (OSError, ValueError, OverflowError):
        return 125


if __name__ == '__main__':
    raise SystemExit(main())
