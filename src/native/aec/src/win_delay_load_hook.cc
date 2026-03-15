#ifdef _MSC_VER

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <windows.h>
#include <delayimp.h>
#include <string.h>

static FARPROC WINAPI load_exe_hook(unsigned int event, DelayLoadInfo* info) {
    if (event != dliNotePreLoadLibrary)
        return NULL;

    if (_stricmp(info->szDll, "node.exe") != 0)
        return NULL;

    HMODULE m = GetModuleHandleW(NULL);
    return (FARPROC)m;
}

decltype(__pfnDliNotifyHook2) __pfnDliNotifyHook2 = load_exe_hook;

#endif
