# Windows Print Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows laptops print badges to the Gainscha with or without its driver, through a small Go tray agent on `127.0.0.1:17171` that the web app finds by itself.

**Architecture:** The browser keeps building the full TSPL job. A Go agent (`itcomprint-frontend/agent/`) receives the bytes over a localhost HTTP API and writes them to a plugged-in USB printer, either through its Windows print queue (RAW) or straight to the `usbprint` device when no driver is installed. The frontend replaces the build-time `createPrinter` with runtime `detectPrinter`: forced preview → agent → agent-setup (Windows) → WebUSB → preview.

**Tech Stack:** Go (stdlib `net/http`, `golang.org/x/sys/windows`, `fyne.io/systray`), Inno Setup, GitHub Actions. Frontend: React 19 + TypeScript + Zustand + Tailwind v4 (existing).

**Spec:** `docs/superpowers/specs/2026-10-29-windows-print-agent-design.md`. Read it alongside this plan.

## Global Constraints

- Agent listens on `127.0.0.1:17171` only, never `0.0.0.0`.
- Every agent request needs an `Origin` in the allowlist (build-time `AGENT_ALLOWED_ORIGINS` + always `http://localhost:5173`); everything else gets `403`.
- `POST /print` body max 4 MB; one print at a time.
- Releases are tagged `agent-vX.Y.Z` in `itcomprint-frontend`, with assets exactly `itcomprint-agent.exe`, `ITCOM-Print-Agent-Setup.exe`, `checksums.txt`. They must stay the only GitHub Releases in this repo.
- Installer is per-user (`PrivilegesRequired=lowest`), installs to `{localappdata}\Programs\ITCOM Print Agent`, autostarts via `HKCU\...\Run\ITCOMPrintAgent`.
- Config at `%APPDATA%\ITCOM Print Agent\config.json`; log at `%LOCALAPPDATA%\ITCOM Print Agent\agent.log`, rotated at 1 MB with one backup.
- Self-update: first check 30 s after start, then every 6 h; SHA-256 verified; never mid-print; disabled for `-dev` builds.
- Agent is built for `GOOS=windows GOARCH=amd64` only. Every agent file assumes Windows.
- Frontend: Mac/Linux WebUSB behaviour stays exactly as today. `VITE_PRINTER_MODE=preview` still forces preview.
- **No unit tests, in either app** (project preference, see `docs/CLAUDE.md`). Verification is `go vet` + `go build` for the agent, `npm run validate` for the frontend, and the manual checks written into each task.
- Commit on branch `feat/windows-print-agent`. husky + lint-staged run on every commit; never skip hooks.

## Review Focus

1. **Windows' virtual printers next to one Gainscha.** Microsoft Print to PDF, XPS and Fax are always present; the Gainscha must still be auto-selected and the virtual ones never listed. _(Task 2, Step 8, check 4)_
2. **Printer unplugged on a laptop that has the driver.** The queue still exists in Windows; the agent must hide it, so the pill goes red within ~10 s instead of jobs vanishing into an offline queue. _(Task 2, Step 8, check 5)_
3. **Agent restarting under an open kiosk** (self-update or Quit → relaunch). The app must fall back to "Set up printing" and recover on its own within ~15 s, with no page reload. _(Task 7, Step 8, check 4)_
4. **Batch print: several `/print` calls back to back.** They must queue behind the print mutex and all come out, in order. _(Task 2, Step 8, check 6)_
5. **A request with a foreign or missing `Origin`** (another website, or `curl` without the header) must get `403`, including the `OPTIONS` preflight. _(Task 2, Step 7)_

---

### Task 1: Go toolchain + printer discovery and writing

**Files:**

- Create: `agent/go.mod`, `agent/go.sum` (generated)
- Create: `agent/printers/printers.go`
- Create: `agent/printers/service.go`
- Create: `agent/printers/usb_windows.go`
- Create: `agent/printers/queue_windows.go`

**Interfaces:**

- Produces (package `github.com/mirzakhalov03/itcomprint-frontend/agent/printers`):
  - `type Transport string` with `TransportQueue = "queue"`, `TransportUSB = "usb"`
  - `type Printer struct { ID string; Name string; Transport Transport }` (JSON `id`, `name`, `transport`)
  - `func NewService(selectedID string, save func(id string)) *Service`
  - `func (s *Service) Status() (Status, error)`
  - `func (s *Service) Select(id string) (Status, error)`
  - `func (s *Service) Print(data []byte) error`
  - `func (s *Service) WithPrintLock(fn func() error) error`
  - `type Status struct { Printers []Printer; SelectedID string }` and `func (s Status) Selected() (Printer, bool)`
  - Errors: `ErrNoPrinterSelected`, `ErrPrinterNotConnected`, `ErrUnknownPrinter`

- [ ] **Step 1: Create the branch and install Go**

```bash
cd itcomprint-frontend
git checkout -b feat/windows-print-agent
git add docs/superpowers/specs/2026-10-29-windows-print-agent-design.md docs/superpowers/plans/2026-10-29-windows-print-agent.md
git commit -m "docs: Windows print agent spec and implementation plan"
```

Go is not installed on this machine. In PowerShell:

```powershell
winget install --id GoLang.Go -e --accept-source-agreements --accept-package-agreements
```

A shell opened before the install won't see `go` on `PATH`. Call it by full path (`& "C:\Program Files\Go\bin\go.exe" version`, or `"/c/Program Files/Go/bin/go"` from Bash) until the terminal is restarted. Expected: `go version go1.2x.x windows/amd64`.

- [ ] **Step 2: Initialise the module**

```bash
mkdir -p agent/printers
cd agent
go mod init github.com/mirzakhalov03/itcomprint-frontend/agent
go get golang.org/x/sys@latest fyne.io/systray@latest
```

- [ ] **Step 3: Write `agent/printers/printers.go`**

```go
// Package printers finds plugged-in USB label printers on Windows and writes raw
// bytes (TSPL) to them, through the print spooler when a driver is installed and
// straight to the usbprint device when it isn't.
package printers

import (
	"errors"
	"fmt"
	"log"
	"slices"
	"strings"
)

type Transport string

const (
	TransportQueue Transport = "queue" // a Windows print queue (driver installed), written in RAW mode
	TransportUSB   Transport = "usb"   // the usbprint device itself (no driver installed)
)

// Printer is one printable target. Only ID, Name and Transport leave the agent.
type Printer struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Transport Transport `json:"transport"`

	queueName  string // spooler queue name (queue transport only)
	devicePath string // usbprint device interface path (both transports)
}

// These messages are shown to operators by the web app, hence the sentence case.
var (
	ErrNoPrinterSelected   = errors.New("No printer selected. Choose one on the app's Printer page.")
	ErrPrinterNotConnected = errors.New("The selected printer is not connected. Check the USB cable and that it is switched on.")
	ErrUnknownPrinter      = errors.New("That printer is not connected to this computer.")
)

type usbDevice struct {
	path        string // device interface path, opened directly for TransportUSB
	port        string // e.g. "USB001", what a print queue's port list refers to; "" if unknown
	description string
}

type queue struct {
	name  string
	ports []string
}

// Discover lists the USB printers plugged in right now. Starting from present
// devices (not from queues) keeps Windows' virtual printers out of the list and
// hides a queue whose printer is unplugged.
func Discover() ([]Printer, error) {
	devices, err := listUSBDevices()
	if err != nil {
		return nil, fmt.Errorf("list USB printers: %w", err)
	}
	queues, err := listQueues()
	if err != nil {
		return nil, fmt.Errorf("list print queues: %w", err)
	}
	return match(devices, queues), nil
}

// match lists each device once per queue on its port (driver installed), or once
// as a direct-USB printer when no queue uses its port (no driver).
func match(devices []usbDevice, queues []queue) []Printer {
	out := []Printer{}
	for _, d := range devices {
		matched := false
		if d.port != "" {
			for _, q := range queues {
				if slices.ContainsFunc(q.ports, func(p string) bool { return strings.EqualFold(p, d.port) }) {
					out = append(out, Printer{ID: "queue:" + q.name, Name: q.name, Transport: TransportQueue, queueName: q.name, devicePath: d.path})
					matched = true
				}
			}
		}
		if !matched {
			out = append(out, Printer{ID: "usb:" + d.path, Name: d.description, Transport: TransportUSB, devicePath: d.path})
		}
	}
	return out
}

// autoSelect picks a printer without asking: the only one, or the only Gainscha.
func autoSelect(list []Printer) (string, bool) {
	if len(list) == 1 {
		return list[0].ID, true
	}
	var hits []Printer
	for _, p := range list {
		name := strings.ToLower(p.Name)
		if strings.Contains(name, "gainscha") || strings.Contains(name, "gprinter") {
			hits = append(hits, p)
		}
	}
	if len(hits) == 1 {
		return hits[0].ID, true
	}
	return "", false
}

func write(p Printer, data []byte) error {
	if p.Transport == TransportQueue {
		err := writeQueue(p.queueName, data)
		if !errors.Is(err, errRawUnsupported) {
			return err
		}
		log.Printf("queue %q rejected RAW data; writing to the USB device directly", p.queueName)
	}
	return writeUSB(p.devicePath, data)
}
```

- [ ] **Step 4: Write `agent/printers/service.go`**

```go
package printers

import (
	"log"
	"slices"
	"strings"
	"sync"
	"time"
)

// Service owns the selected printer and serialises prints.
type Service struct {
	mu         sync.Mutex // guards selectedID and lastIDs
	printMu    sync.Mutex // one print (or updater binary swap) at a time
	selectedID string
	lastIDs    string
	save       func(id string)
}

// Status is a snapshot: the printers plugged in now and the saved selection,
// which may name a printer that's currently unplugged.
type Status struct {
	Printers   []Printer
	SelectedID string
}

func (s Status) Selected() (Printer, bool) {
	i := slices.IndexFunc(s.Printers, func(p Printer) bool { return p.ID == s.SelectedID })
	if i < 0 {
		return Printer{}, false
	}
	return s.Printers[i], true
}

func NewService(selectedID string, save func(id string)) *Service {
	return &Service{selectedID: selectedID, save: save}
}

// Status re-discovers printers. If the saved printer isn't plugged in and
// auto-selection finds one, that one is adopted and saved (printer swapped);
// otherwise the saved id is kept, so an unplugged printer comes back by itself.
func (s *Service) Status() (Status, error) {
	list, err := Discover()
	if err != nil {
		return Status{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.logChanges(list)
	if !slices.ContainsFunc(list, func(p Printer) bool { return p.ID == s.selectedID }) {
		if id, ok := autoSelect(list); ok {
			s.selectedID = id
			s.save(id)
			log.Printf("auto-selected printer %s", id)
		}
	}
	return Status{Printers: list, SelectedID: s.selectedID}, nil
}

func (s *Service) Select(id string) (Status, error) {
	list, err := Discover()
	if err != nil {
		return Status{}, err
	}
	if !slices.ContainsFunc(list, func(p Printer) bool { return p.ID == id }) {
		return Status{}, ErrUnknownPrinter
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.selectedID = id
	s.save(id)
	log.Printf("selected printer %s", id)
	return Status{Printers: list, SelectedID: id}, nil
}

func (s *Service) Print(data []byte) error {
	s.printMu.Lock()
	defer s.printMu.Unlock()
	st, err := s.Status()
	if err != nil {
		return err
	}
	if st.SelectedID == "" {
		return ErrNoPrinterSelected
	}
	p, ok := st.Selected()
	if !ok {
		return ErrPrinterNotConnected
	}
	start := time.Now()
	err = write(p, data)
	log.Printf("print %s: %d bytes in %s, err=%v", p.ID, len(data), time.Since(start).Round(time.Millisecond), err)
	return err
}

// WithPrintLock runs fn while no print is in progress (the updater's binary swap).
func (s *Service) WithPrintLock(fn func() error) error {
	s.printMu.Lock()
	defer s.printMu.Unlock()
	return fn()
}

// logChanges records plug/unplug events once, not on every poll. Caller holds s.mu.
func (s *Service) logChanges(list []Printer) {
	ids := make([]string, len(list))
	for i, p := range list {
		ids[i] = p.ID
	}
	joined := strings.Join(ids, ", ")
	if joined != s.lastIDs {
		log.Printf("printers: [%s]", joined)
		s.lastIDs = joined
	}
}
```

- [ ] **Step 5: Write `agent/printers/usb_windows.go`**

```go
package printers

import (
	"errors"
	"fmt"
	"log"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

var (
	setupapi                              = windows.NewLazySystemDLL("setupapi.dll")
	procSetupDiGetClassDevsW              = setupapi.NewProc("SetupDiGetClassDevsW")
	procSetupDiEnumDeviceInterfaces       = setupapi.NewProc("SetupDiEnumDeviceInterfaces")
	procSetupDiGetDeviceInterfaceDetailW  = setupapi.NewProc("SetupDiGetDeviceInterfaceDetailW")
	procSetupDiOpenDeviceInterfaceRegKey  = setupapi.NewProc("SetupDiOpenDeviceInterfaceRegKey")
	procSetupDiGetDevicePropertyW         = setupapi.NewProc("SetupDiGetDevicePropertyW")
	procSetupDiGetDeviceRegistryPropertyW = setupapi.NewProc("SetupDiGetDeviceRegistryPropertyW")
	procSetupDiDestroyDeviceInfoList      = setupapi.NewProc("SetupDiDestroyDeviceInfoList")
)

// GUID_DEVINTERFACE_USBPRINT: registered by Windows' usbprint.sys for every USB
// printer, whether or not a vendor driver is installed.
var guidUSBPrint = windows.GUID{Data1: 0x28d78fad, Data2: 0x5a12, Data3: 0x11d1, Data4: [8]byte{0xae, 0x5b, 0x00, 0x00, 0xf8, 0x03, 0xa8, 0xc2}}

// DEVPKEY_Device_BusReportedDeviceDesc: the product string the printer reports itself.
var devpkeyBusReportedDeviceDesc = devPropKey{
	fmtid: windows.GUID{Data1: 0x540b947e, Data2: 0x8b40, Data3: 0x45bc, Data4: [8]byte{0xa8, 0xa2, 0x6a, 0x0b, 0x89, 0x4c, 0xbd, 0xa2}},
	pid:   4,
}

const (
	digcfPresent         = 0x2
	digcfDeviceInterface = 0x10
	spdrpDeviceDesc      = 0x0
	// sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA_W) on 64-bit Windows (it is 6 on 32-bit; we only build amd64).
	detailCbSize    = 8
	waitTimeout     = 0x102
	usbWriteTimeout = 15 * time.Second
)

type devPropKey struct {
	fmtid windows.GUID
	pid   uint32
}

type spDeviceInterfaceData struct {
	cbSize             uint32
	interfaceClassGuid windows.GUID
	flags              uint32
	reserved           uintptr
}

type spDevinfoData struct {
	cbSize    uint32
	classGuid windows.GUID
	devInst   uint32
	reserved  uintptr
}

func listUSBDevices() ([]usbDevice, error) {
	h, _, err := procSetupDiGetClassDevsW.Call(uintptr(unsafe.Pointer(&guidUSBPrint)), 0, 0, digcfPresent|digcfDeviceInterface)
	if windows.Handle(h) == windows.InvalidHandle {
		return nil, err
	}
	defer procSetupDiDestroyDeviceInfoList.Call(h)

	var out []usbDevice
	for i := uint32(0); ; i++ {
		iface := spDeviceInterfaceData{cbSize: uint32(unsafe.Sizeof(spDeviceInterfaceData{}))}
		r, _, err := procSetupDiEnumDeviceInterfaces.Call(h, 0, uintptr(unsafe.Pointer(&guidUSBPrint)), uintptr(i), uintptr(unsafe.Pointer(&iface)))
		if r == 0 {
			if errors.Is(err, windows.ERROR_NO_MORE_ITEMS) {
				return out, nil
			}
			return nil, err
		}
		dev, err := describeDevice(h, &iface)
		if err != nil {
			log.Printf("skipping USB printer #%d: %v", i, err)
			continue
		}
		out = append(out, dev)
	}
}

func describeDevice(h uintptr, iface *spDeviceInterfaceData) (usbDevice, error) {
	var required uint32
	procSetupDiGetDeviceInterfaceDetailW.Call(h, uintptr(unsafe.Pointer(iface)), 0, 0, uintptr(unsafe.Pointer(&required)), 0)
	if required == 0 {
		return usbDevice{}, errors.New("no interface detail")
	}
	// uint64s keep the buffer 8-byte aligned for the cbSize write.
	buf := make([]uint64, (required+7)/8)
	*(*uint32)(unsafe.Pointer(&buf[0])) = detailCbSize
	info := spDevinfoData{cbSize: uint32(unsafe.Sizeof(spDevinfoData{}))}
	r, _, err := procSetupDiGetDeviceInterfaceDetailW.Call(h, uintptr(unsafe.Pointer(iface)), uintptr(unsafe.Pointer(&buf[0])), uintptr(required), 0, uintptr(unsafe.Pointer(&info)))
	if r == 0 {
		return usbDevice{}, err
	}
	// DevicePath (WCHAR[]) starts right after the 4-byte cbSize.
	path := windows.UTF16PtrToString((*uint16)(unsafe.Add(unsafe.Pointer(&buf[0]), 4)))
	return usbDevice{path: path, port: portName(h, iface), description: description(h, &info)}, nil
}

// portName reads the "USB001"-style port usbprint assigned, stored as Base Name +
// Port Number under the interface's Device Parameters key. Print queues refer to it.
func portName(h uintptr, iface *spDeviceInterfaceData) string {
	k, _, _ := procSetupDiOpenDeviceInterfaceRegKey.Call(h, uintptr(unsafe.Pointer(iface)), 0, registry.QUERY_VALUE)
	if windows.Handle(k) == windows.InvalidHandle {
		return ""
	}
	key := registry.Key(k)
	defer key.Close()
	base, _, err := key.GetStringValue("Base Name")
	if err != nil {
		return ""
	}
	num, _, err := key.GetIntegerValue("Port Number")
	if err != nil {
		return ""
	}
	return fmt.Sprintf("%s%03d", base, num)
}

func description(h uintptr, info *spDevinfoData) string {
	buf := make([]uint16, 256)
	var propType uint32
	r, _, _ := procSetupDiGetDevicePropertyW.Call(h, uintptr(unsafe.Pointer(info)), uintptr(unsafe.Pointer(&devpkeyBusReportedDeviceDesc)),
		uintptr(unsafe.Pointer(&propType)), uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)*2), 0, 0)
	if r != 0 {
		if s := windows.UTF16ToString(buf); s != "" {
			return s
		}
	}
	r, _, _ = procSetupDiGetDeviceRegistryPropertyW.Call(h, uintptr(unsafe.Pointer(info)), spdrpDeviceDesc, 0,
		uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)*2), 0)
	if r != 0 {
		if s := windows.UTF16ToString(buf); s != "" {
			return s
		}
	}
	return "USB printer"
}

// writeUSB writes straight to the usbprint device. Overlapped I/O lets a wedged
// printer (paused, out of labels) time out instead of hanging the agent.
func writeUSB(path string, data []byte) error {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	h, err := windows.CreateFile(p, windows.GENERIC_WRITE, windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE, nil, windows.OPEN_EXISTING, windows.FILE_FLAG_OVERLAPPED, 0)
	if err != nil {
		return fmt.Errorf("open printer: %w", err)
	}
	defer windows.CloseHandle(h)
	ev, err := windows.CreateEvent(nil, 1, 0, nil)
	if err != nil {
		return err
	}
	defer windows.CloseHandle(ev)

	// Heap-allocated so the kernel's pointer to it stays valid (goroutine stacks can move).
	ov := new(windows.Overlapped)
	for len(data) > 0 {
		*ov = windows.Overlapped{HEvent: ev}
		if err := windows.WriteFile(h, data, nil, ov); err != nil && !errors.Is(err, windows.ERROR_IO_PENDING) {
			return fmt.Errorf("write to printer: %w", err)
		}
		if s, _ := windows.WaitForSingleObject(ev, uint32(usbWriteTimeout.Milliseconds())); s == waitTimeout {
			windows.CancelIoEx(h, ov)
			var n uint32
			windows.GetOverlappedResult(h, ov, &n, true)
			return errors.New("the printer did not take the label within 15 s. Is it paused or out of labels?")
		}
		var n uint32
		if err := windows.GetOverlappedResult(h, ov, &n, false); err != nil {
			return fmt.Errorf("write to printer: %w", err)
		}
		if n == 0 {
			return errors.New("write to printer: the printer accepted no data")
		}
		data = data[n:]
		windows.ResetEvent(ev)
	}
	return nil
}
```

- [ ] **Step 6: Write `agent/printers/queue_windows.go`**

```go
package printers

import (
	"errors"
	"fmt"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	winspool             = windows.NewLazySystemDLL("winspool.drv")
	procEnumPrintersW    = winspool.NewProc("EnumPrintersW")
	procOpenPrinterW     = winspool.NewProc("OpenPrinterW")
	procClosePrinter     = winspool.NewProc("ClosePrinter")
	procStartDocPrinterW = winspool.NewProc("StartDocPrinterW")
	procEndDocPrinter    = winspool.NewProc("EndDocPrinter")
	procStartPagePrinter = winspool.NewProc("StartPagePrinter")
	procEndPagePrinter   = winspool.NewProc("EndPagePrinter")
	procWritePrinter     = winspool.NewProc("WritePrinter")
)

const (
	printerEnumLocal   = 0x2
	errInvalidDatatype = windows.Errno(1804) // ERROR_INVALID_DATATYPE
)

// errRawUnsupported: the queue's driver won't take RAW jobs (some XPS-only
// drivers); write() falls back to the device directly.
var errRawUnsupported = errors.New("print queue does not accept RAW data")

type printerInfo5 struct {
	printerName              *uint16
	portName                 *uint16
	attributes               uint32
	deviceNotSelectedTimeout uint32
	transmissionRetryTimeout uint32
}

type docInfo1 struct {
	docName    *uint16
	outputFile *uint16
	datatype   *uint16
}

func listQueues() ([]queue, error) {
	var needed, returned uint32
	procEnumPrintersW.Call(printerEnumLocal, 0, 5, 0, 0, uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if needed == 0 {
		return nil, nil
	}
	buf := make([]uint64, (needed+7)/8)
	r, _, err := procEnumPrintersW.Call(printerEnumLocal, 0, 5, uintptr(unsafe.Pointer(&buf[0])), uintptr(needed),
		uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if r == 0 {
		return nil, err
	}
	infos := unsafe.Slice((*printerInfo5)(unsafe.Pointer(&buf[0])), returned)
	out := make([]queue, 0, len(infos))
	for _, in := range infos {
		var ports []string
		for _, p := range strings.Split(windows.UTF16PtrToString(in.portName), ",") {
			if p = strings.TrimSpace(p); p != "" {
				ports = append(ports, p)
			}
		}
		out = append(out, queue{name: windows.UTF16PtrToString(in.printerName), ports: ports})
	}
	return out, nil
}

// writeQueue sends data as one RAW job, so the driver passes the TSPL through untouched.
func writeQueue(name string, data []byte) error {
	n16, err := windows.UTF16PtrFromString(name)
	if err != nil {
		return err
	}
	var h windows.Handle
	if r, _, err := procOpenPrinterW.Call(uintptr(unsafe.Pointer(n16)), uintptr(unsafe.Pointer(&h)), 0); r == 0 {
		return fmt.Errorf("open print queue %q: %w", name, err)
	}
	defer procClosePrinter.Call(uintptr(h))

	docName, _ := windows.UTF16PtrFromString("ITCOM badge")
	datatype, _ := windows.UTF16PtrFromString("RAW")
	doc := docInfo1{docName: docName, datatype: datatype}
	if r, _, err := procStartDocPrinterW.Call(uintptr(h), 1, uintptr(unsafe.Pointer(&doc))); r == 0 {
		if errors.Is(err, errInvalidDatatype) {
			return errRawUnsupported
		}
		return fmt.Errorf("start print job: %w", err)
	}
	defer procEndDocPrinter.Call(uintptr(h))
	if r, _, err := procStartPagePrinter.Call(uintptr(h)); r == 0 {
		return fmt.Errorf("start print page: %w", err)
	}
	defer procEndPagePrinter.Call(uintptr(h))

	for len(data) > 0 {
		var written uint32
		r, _, err := procWritePrinter.Call(uintptr(h), uintptr(unsafe.Pointer(&data[0])), uintptr(len(data)), uintptr(unsafe.Pointer(&written)))
		if r == 0 {
			return fmt.Errorf("write print job: %w", err)
		}
		if written == 0 {
			return errors.New("write print job: the queue accepted no data")
		}
		data = data[written:]
	}
	return nil
}
```

- [ ] **Step 7: Vet and build the package**

Run from `agent/`: `go mod tidy && go vet ./... && go build ./...`
Expected: no output, exit 0. (`go vet` may warn "possible misuse of unsafe.Pointer" on the `unsafe.Slice`/`unsafe.Add` lines; those are intentional Win32 buffer reads. Anything else must be fixed.)

- [ ] **Step 8: Commit**

```bash
git add agent/go.mod agent/go.sum agent/printers
git commit -m "feat(agent): discover USB printers and write raw TSPL via spooler or usbprint"
```

---

### Task 2: Agent process + localhost HTTP API

**Files:**

- Create: `agent/logging.go`, `agent/instance.go`, `agent/config.go`, `agent/server.go`, `agent/main.go`

**Interfaces:**

- Consumes: everything `printers` produces (Task 1).
- Produces (package `main`): `version`, `allowedOrigins` (ldflags vars), `const listenAddr`, `const appDirName = "ITCOM Print Agent"`, `func setupLogging() func()`, `func logPath() string`, `func acquireSingleInstance(wait time.Duration) bool`, `func listenWithRetry(addr string, wait time.Duration) (net.Listener, error)`, `func loadConfig() config`, `func saveConfig(c config) error`, `func newServer(svc *printers.Service, origins map[string]bool) http.Handler`, `func parseOrigins(raw string) map[string]bool`.
- HTTP contract (consumed by Task 6's `agentClient`):
  - `GET /status` → `200 {"version","hostname","printers":[{"id","name","transport"}],"selectedId":string|null}`
  - `PUT /printer` body `{"id":string}` → `200` status body · `404` unknown · `400` bad JSON
  - `POST /print` raw bytes → `204` · `400` empty · `409` no/not-connected printer · `413` > 4 MB · `502` write failed
  - Errors: `{"error": "<message>"}`

- [ ] **Step 1: Write `agent/logging.go`**

```go
package main

import (
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"

	"golang.org/x/sys/windows"
)

const (
	appDirName = "ITCOM Print Agent"
	maxLogSize = 1 << 20 // rotate at 1 MB, keeping one backup
)

// logPath is %LOCALAPPDATA%\ITCOM Print Agent\agent.log.
func logPath() string {
	dir, err := os.UserCacheDir()
	if err != nil {
		dir = os.TempDir()
	}
	return filepath.Join(dir, appDirName, "agent.log")
}

type rotatingFile struct {
	mu   sync.Mutex
	path string
	f    *os.File
	size int64
}

func (r *rotatingFile) open() error {
	f, err := os.OpenFile(r.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	st, err := f.Stat()
	if err != nil {
		f.Close()
		return err
	}
	r.f, r.size = f, st.Size()
	return nil
}

func (r *rotatingFile) Write(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.size+int64(len(p)) > maxLogSize {
		r.f.Close()
		os.Rename(r.path, r.path+".1")
		if err := r.open(); err != nil {
			return 0, err
		}
	}
	n, err := r.f.Write(p)
	r.size += int64(n)
	return n, err
}

// setupLogging logs to the rotating file and to stderr (visible in dev builds).
// The file comes first in the MultiWriter: in a windowsgui build stderr is
// invalid, and MultiWriter stops at the first writer that fails.
func setupLogging() func() {
	rf := &rotatingFile{path: logPath()}
	if err := os.MkdirAll(filepath.Dir(rf.path), 0o755); err == nil {
		if err := rf.open(); err == nil {
			log.SetOutput(io.MultiWriter(rf, os.Stderr))
			return func() { rf.f.Close() }
		}
	}
	return func() {}
}

func openLogFile() {
	verb, _ := windows.UTF16PtrFromString("open")
	file, _ := windows.UTF16PtrFromString(logPath())
	if err := windows.ShellExecute(0, verb, file, nil, nil, windows.SW_SHOWNORMAL); err != nil {
		log.Printf("open log: %v", err)
	}
}
```

- [ ] **Step 2: Write `agent/instance.go`**

```go
package main

import (
	"errors"
	"net"
	"time"

	"golang.org/x/sys/windows"
)

// Held for the process lifetime; Windows releases it when the process exits.
var instanceMutex windows.Handle

// acquireSingleInstance reports whether this is the only running agent. With a
// non-zero wait it keeps trying, so a freshly updated binary can wait for the
// old process to exit.
func acquireSingleInstance(wait time.Duration) bool {
	name, _ := windows.UTF16PtrFromString(`Local\ITCOMPrintAgent`)
	deadline := time.Now().Add(wait)
	for {
		h, err := windows.CreateMutex(nil, false, name)
		if err == nil {
			instanceMutex = h
			return true
		}
		if h != 0 {
			windows.CloseHandle(h)
		}
		if !errors.Is(err, windows.ERROR_ALREADY_EXISTS) || time.Now().After(deadline) {
			return false
		}
		time.Sleep(500 * time.Millisecond)
	}
}

func listenWithRetry(addr string, wait time.Duration) (net.Listener, error) {
	deadline := time.Now().Add(wait)
	for {
		ln, err := net.Listen("tcp", addr)
		if err == nil || time.Now().After(deadline) {
			return ln, err
		}
		time.Sleep(500 * time.Millisecond)
	}
}
```

- [ ] **Step 3: Write `agent/config.go`**

```go
package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
)

type config struct {
	SelectedID string `json:"selectedId"`
}

// configPath is %APPDATA%\ITCOM Print Agent\config.json.
func configPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, appDirName, "config.json"), nil
}

func loadConfig() config {
	var c config
	path, err := configPath()
	if err != nil {
		return c
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("read config: %v", err)
		}
		return c
	}
	if err := json.Unmarshal(data, &c); err != nil {
		log.Printf("parse config: %v", err)
	}
	return c
}

// saveConfig writes via a temp file + rename so a crash never leaves half a file.
func saveConfig(c config) error {
	path, err := configPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
```

- [ ] **Step 4: Write `agent/server.go`**

```go
package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/mirzakhalov03/itcomprint-frontend/agent/printers"
)

const maxJobBytes = 4 << 20

const devOrigin = "http://localhost:5173"

type statusResponse struct {
	Version    string             `json:"version"`
	Hostname   string             `json:"hostname"`
	Printers   []printers.Printer `json:"printers"`
	SelectedID *string            `json:"selectedId"`
}

// parseOrigins turns the build-time comma-separated allowlist into a set,
// always including the Vite dev server.
func parseOrigins(raw string) map[string]bool {
	set := map[string]bool{devOrigin: true}
	for _, o := range strings.Split(raw, ",") {
		if o = strings.TrimRight(strings.TrimSpace(o), "/"); o != "" {
			set[o] = true
		}
	}
	return set
}

func newServer(svc *printers.Service, origins map[string]bool) http.Handler {
	hostname, _ := os.Hostname()
	toResponse := func(st printers.Status) statusResponse {
		res := statusResponse{Version: version, Hostname: hostname, Printers: st.Printers}
		if st.SelectedID != "" {
			res.SelectedID = &st.SelectedID
		}
		return res
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /status", func(w http.ResponseWriter, r *http.Request) {
		st, err := svc.Status()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, toResponse(st))
	})
	mux.HandleFunc("PUT /printer", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			ID string `json:"id"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body); err != nil || body.ID == "" {
			writeError(w, http.StatusBadRequest, `Expected {"id": "<printer id>"}.`)
			return
		}
		st, err := svc.Select(body.ID)
		switch {
		case errors.Is(err, printers.ErrUnknownPrinter):
			writeError(w, http.StatusNotFound, err.Error())
		case err != nil:
			writeError(w, http.StatusInternalServerError, err.Error())
		default:
			writeJSON(w, http.StatusOK, toResponse(st))
		}
	})
	mux.HandleFunc("POST /print", func(w http.ResponseWriter, r *http.Request) {
		data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxJobBytes))
		var tooBig *http.MaxBytesError
		switch {
		case errors.As(err, &tooBig):
			writeError(w, http.StatusRequestEntityTooLarge, "Print job is larger than 4 MB.")
			return
		case err != nil:
			writeError(w, http.StatusBadRequest, "Could not read the print job.")
			return
		case len(data) == 0:
			writeError(w, http.StatusBadRequest, "Print job is empty.")
			return
		}
		err = svc.Print(data)
		switch {
		case errors.Is(err, printers.ErrNoPrinterSelected), errors.Is(err, printers.ErrPrinterNotConnected):
			writeError(w, http.StatusConflict, err.Error())
		case err != nil:
			writeError(w, http.StatusBadGateway, "Printing failed: "+err.Error())
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	})
	return withOrigins(origins, mux)
}

// withOrigins lets only the ITCOM app's pages call the agent. Otherwise any
// website open in the browser could print to this laptop.
func withOrigins(origins map[string]bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if !origins[origin] {
			log.Printf("rejected %s %s from origin %q", r.Method, r.URL.Path, origin)
			writeError(w, http.StatusForbidden, "Origin not allowed.")
			return
		}
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", origin)
		h.Add("Vary", "Origin")
		if r.Method == http.MethodOptions {
			h.Set("Access-Control-Allow-Methods", "GET, PUT, POST")
			h.Set("Access-Control-Allow-Headers", "Content-Type")
			// Chrome's Private Network Access preflight for public site → loopback.
			if r.Header.Get("Access-Control-Request-Private-Network") == "true" {
				h.Set("Access-Control-Allow-Private-Network", "true")
			}
			h.Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
```

- [ ] **Step 5: Write `agent/main.go`** (the tray replaces the signal wait in Task 3)

```go
// Command itcomprint-agent is the ITCOM print agent: a Windows tray app that
// relays raw TSPL from the ITCOM web app (over 127.0.0.1) to a USB label printer.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/mirzakhalov03/itcomprint-frontend/agent/printers"
)

// Set at build time via -ldflags -X (see .github/workflows/agent-release.yml).
var (
	version        = "0.0.0-dev"
	allowedOrigins = ""
)

const listenAddr = "127.0.0.1:17171"

func main() {
	closeLog := setupLogging()
	defer closeLog()
	log.Printf("ITCOM Print Agent %s starting", version)

	if !acquireSingleInstance(0) {
		log.Print("another agent is already running; exiting")
		return
	}

	svc := printers.NewService(loadConfig().SelectedID, func(id string) {
		if err := saveConfig(config{SelectedID: id}); err != nil {
			log.Printf("save config: %v", err)
		}
	})
	srv := &http.Server{Handler: newServer(svc, parseOrigins(allowedOrigins)), ReadHeaderTimeout: 10 * time.Second}
	ln, err := listenWithRetry(listenAddr, 0)
	if err != nil {
		log.Printf("listen %s: %v", listenAddr, err)
		return
	}
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("serve: %v", err)
		}
	}()
	log.Printf("listening on %s", listenAddr)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}
```

- [ ] **Step 6: Build and run in a console**

From `agent/`: `go vet ./... && go build -o dist/itcomprint-agent.exe . && ./dist/itcomprint-agent.exe`
Expected: console prints `ITCOM Print Agent 0.0.0-dev starting`, `printers: [...]`, `listening on 127.0.0.1:17171`. (`dist/` is already gitignored.)

- [ ] **Step 7: Manual API checks** (second terminal, agent running)

```bash
# Allowed origin → 200 with version, hostname, printers, selectedId
curl -s -H "Origin: http://localhost:5173" http://127.0.0.1:17171/status
# Review Focus 5: no Origin and a foreign one → 403, preflight too
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:17171/status
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://evil.example" http://127.0.0.1:17171/status
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS -H "Origin: https://evil.example" http://127.0.0.1:17171/print
# Preflight from the allowed origin → 204 with Access-Control-Allow-Private-Network: true
curl -s -i -X OPTIONS -H "Origin: http://localhost:5173" -H "Access-Control-Request-Private-Network: true" http://127.0.0.1:17171/print
# Empty job → 400
curl -s -X POST -H "Origin: http://localhost:5173" --data-binary "" http://127.0.0.1:17171/print
```

Expected: `200` JSON; then `403`, `403`, `403`; then `204` with the PNA header; then `{"error":"Print job is empty."}`.

- [ ] **Step 8: Hardware checks** (Gainscha plugged in; `test.prn` is a small TSPL file)

Create `test.prn` (plain text, LF line endings):

```
SIZE 80 mm, 60 mm
GAP 2 mm, 0 mm
CLS
TEXT 40,40,"3",0,1,1,"AGENT TEST"
PRINT 1,1
```

```bash
curl -s -X POST -H "Origin: http://localhost:5173" -H "Content-Type: application/octet-stream" --data-binary @test.prn -w "%{http_code}\n" http://127.0.0.1:17171/print
```

1. Driver installed: `/status` lists the Gainscha with `"transport":"queue"`, `selectedId` set; the POST returns `204` and a label prints.
2. Driver uninstalled (Settings → Printers → remove the Gainscha, then unplug/replug): `/status` lists it with `"transport":"usb"`; the POST prints a label.
3. Two printers plugged in, nothing saved: `selectedId` is `null`. `curl -X PUT -H "Origin: http://localhost:5173" -d '{"id":"<id>"}' http://127.0.0.1:17171/printer` selects one, and `%APPDATA%\ITCOM Print Agent\config.json` now holds it.
4. **Review Focus 1:** with the driver installed, `/status` never lists "Microsoft Print to PDF", XPS or Fax, and the Gainscha is auto-selected.
5. **Review Focus 2:** driver installed, unplug the printer → `/status` returns `"printers":[]` with `selectedId` still set; POST returns `409`. Replug → it's back and selected.
6. **Review Focus 4:** fire five POSTs at once (`for i in 1 2 3 4 5; do curl ... & done; wait`) → five labels, all `204`, and the log shows five sequential `print` lines.

- [ ] **Step 9: Commit**

```bash
git add agent
git commit -m "feat(agent): localhost HTTP API with origin allowlist, config and rotating log"
```

---

### Task 3: Tray icon and menu

**Files:**

- Create: `agent/icon.go`, `agent/tray.go`
- Modify: `agent/main.go` (replace the signal wait with the tray)

**Interfaces:**

- Consumes: `printers.Service.Status()`, `Status.Selected()`, `openLogFile()`, `version`.
- Produces: `func runTray(svc *printers.Service, fatal string)`. It blocks until Quit (or `systray.Quit()` from anywhere, e.g. the updater in Task 4).

- [ ] **Step 1: Write `agent/icon.go`**

```go
package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"math"
)

// Tray icons are drawn in code rather than shipped as files: a filled circle,
// brand green when a printer is ready, grey otherwise.
var (
	iconReady = circleIcon(color.RGBA{0x88, 0xbd, 0x55, 0xff})
	iconIdle  = circleIcon(color.RGBA{0x9a, 0x9a, 0x9a, 0xff})
)

func trayIcon(ready bool) []byte {
	if ready {
		return iconReady
	}
	return iconIdle
}

func circleIcon(c color.RGBA) []byte {
	const size = 32
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	center, radius := float64(size)/2, float64(size)/2-1
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			d := math.Hypot(float64(x)+0.5-center, float64(y)+0.5-center)
			a := math.Max(0, math.Min(1, radius-d+0.5)) // 1px anti-aliased edge
			if a == 0 {
				continue
			}
			// image.RGBA is premultiplied alpha.
			img.SetRGBA(x, y, color.RGBA{uint8(float64(c.R) * a), uint8(float64(c.G) * a), uint8(float64(c.B) * a), uint8(255 * a)})
		}
	}
	var p bytes.Buffer
	png.Encode(&p, img)
	return pngToICO(p.Bytes(), size)
}

// pngToICO wraps a PNG in a one-image ICO container, which Windows tray icons require.
func pngToICO(p []byte, size int) []byte {
	var b bytes.Buffer
	binary.Write(&b, binary.LittleEndian, struct{ Reserved, Type, Count uint16 }{0, 1, 1})
	binary.Write(&b, binary.LittleEndian, struct {
		Width, Height, Colors, Reserved uint8
		Planes, BitCount                uint16
		Size, Offset                    uint32
	}{uint8(size), uint8(size), 0, 0, 1, 32, uint32(len(p)), 6 + 16})
	b.Write(p)
	return b.Bytes()
}
```

- [ ] **Step 2: Write `agent/tray.go`**

```go
package main

import (
	"time"

	"fyne.io/systray"

	"github.com/mirzakhalov03/itcomprint-frontend/agent/printers"
)

// runTray blocks until Quit. fatal, when set, is shown instead of printer status
// (e.g. the port is taken and the agent can't serve).
func runTray(svc *printers.Service, fatal string) {
	systray.Run(func() { onTrayReady(svc, fatal) }, func() {})
}

func onTrayReady(svc *printers.Service, fatal string) {
	systray.SetTitle("ITCOM Print Agent")
	status := systray.AddMenuItem("Starting…", "")
	status.Disable()
	ver := systray.AddMenuItem("Version "+version, "")
	ver.Disable()
	systray.AddSeparator()
	openLog := systray.AddMenuItem("Open log", "Open the agent's log file")
	quit := systray.AddMenuItem("Quit", "Stop the print agent")

	refresh := func() {
		text, ready := fatal, false
		if fatal == "" {
			text, ready = trayStatus(svc)
		}
		status.SetTitle(text)
		systray.SetTooltip("ITCOM Print Agent: " + text)
		systray.SetIcon(trayIcon(ready))
	}
	refresh()

	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				refresh()
			case <-openLog.ClickedCh:
				openLogFile()
			case <-quit.ClickedCh:
				systray.Quit()
				return
			}
		}
	}()
}

func trayStatus(svc *printers.Service) (string, bool) {
	st, err := svc.Status()
	if err != nil {
		return "Can't list printers (see log)", false
	}
	if p, ok := st.Selected(); ok {
		return "Ready: " + p.Name, true
	}
	if len(st.Printers) == 0 {
		return "No printer found", false
	}
	return "Choose a printer in the app", false
}
```

- [ ] **Step 3: Replace `agent/main.go`**

```go
// Command itcomprint-agent is the ITCOM print agent: a Windows tray app that
// relays raw TSPL from the ITCOM web app (over 127.0.0.1) to a USB label printer.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/mirzakhalov03/itcomprint-frontend/agent/printers"
)

// Set at build time via -ldflags -X (see .github/workflows/agent-release.yml).
var (
	version        = "0.0.0-dev"
	allowedOrigins = ""
)

const listenAddr = "127.0.0.1:17171"

func main() {
	closeLog := setupLogging()
	defer closeLog()
	log.Printf("ITCOM Print Agent %s starting", version)

	if !acquireSingleInstance(0) {
		log.Print("another agent is already running; exiting")
		return
	}

	svc := printers.NewService(loadConfig().SelectedID, func(id string) {
		if err := saveConfig(config{SelectedID: id}); err != nil {
			log.Printf("save config: %v", err)
		}
	})
	srv := &http.Server{Handler: newServer(svc, parseOrigins(allowedOrigins)), ReadHeaderTimeout: 10 * time.Second}

	fatal := ""
	if ln, err := listenWithRetry(listenAddr, 0); err != nil {
		log.Printf("listen %s: %v", listenAddr, err)
		fatal = "Port 17171 in use"
	} else {
		go func() {
			if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
				log.Printf("serve: %v", err)
			}
		}()
		log.Printf("listening on %s", listenAddr)
	}

	runTray(svc, fatal)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
	log.Print("stopped")
}
```

- [ ] **Step 4: Build and check the tray**

From `agent/`: `go vet ./... && go build -o dist/itcomprint-agent.exe . && ./dist/itcomprint-agent.exe`

1. A grey circle appears in the tray (it may sit in the overflow ^). Its menu shows the status, "Version 0.0.0-dev", "Open log" and "Quit".
2. Plug the Gainscha in → within 5 s the icon turns green and the status reads "Ready: <name>".
3. "Open log" opens `agent.log` in the default text editor.
4. Run the exe a second time → it exits at once (the log shows "another agent is already running").
5. Start any other program on port 17171 first (`python -m http.server 17171 --bind 127.0.0.1`), then the agent → the tray reads "Port 17171 in use".
6. "Quit" removes the icon and the process exits (log: "stopped").

- [ ] **Step 5: Commit**

```bash
git add agent
git commit -m "feat(agent): tray icon with live printer status, log and quit"
```

---

### Task 4: Self-update from GitHub Releases

**Files:**

- Create: `agent/updater.go`
- Modify: `agent/main.go` (the `--after-update` wait, old-binary cleanup, start the updater)

**Interfaces:**

- Consumes: `printers.Service.WithPrintLock`, `version`, `systray.Quit`.
- Produces: `func runUpdater(svc *printers.Service, quit func())`, `func removeOldBinary()`, and the `--after-update` command-line flag contract.

- [ ] **Step 1: Write `agent/updater.go`**

```go
package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/mirzakhalov03/itcomprint-frontend/agent/printers"
)

const (
	releasesURL     = "https://api.github.com/repos/mirzakhalov03/itcomprint-frontend/releases?per_page=30"
	tagPrefix       = "agent-v"
	exeAsset        = "itcomprint-agent.exe"
	checksumsAsset  = "checksums.txt"
	firstCheckDelay = 30 * time.Second
	checkInterval   = 6 * time.Hour
)

var httpClient = &http.Client{Timeout: 5 * time.Minute}

type ghRelease struct {
	TagName    string    `json:"tag_name"`
	Draft      bool      `json:"draft"`
	Prerelease bool      `json:"prerelease"`
	Assets     []ghAsset `json:"assets"`
}

type ghAsset struct {
	Name string `json:"name"`
	URL  string `json:"browser_download_url"`
}

// runUpdater checks for a newer agent shortly after start, then every 6 h.
// Failures are logged and never affect printing. quit stops this process once
// the new binary has been started.
func runUpdater(svc *printers.Service, quit func()) {
	if strings.Contains(version, "-dev") {
		log.Print("dev build: auto-update disabled")
		return
	}
	time.Sleep(firstCheckDelay)
	for {
		updated, err := checkForUpdate(svc)
		if err != nil {
			log.Printf("update check: %v", err)
		}
		if updated {
			quit()
			return
		}
		time.Sleep(checkInterval)
	}
}

func checkForUpdate(svc *printers.Service) (bool, error) {
	removeOldBinary()
	rel, latest, err := latestRelease()
	if err != nil || rel == nil {
		return false, err
	}
	current, ok := parseSemver(version)
	if !ok || !newer(latest, current) {
		return false, nil
	}
	exeURL, sumsURL := assetURL(rel, exeAsset), assetURL(rel, checksumsAsset)
	if exeURL == "" || sumsURL == "" {
		return false, fmt.Errorf("release %s is missing %s or %s", rel.TagName, exeAsset, checksumsAsset)
	}
	log.Printf("updating %s → %s", version, rel.TagName)

	exe, err := currentExe()
	if err != nil {
		return false, err
	}
	newPath := exe + ".new"
	if err := download(exeURL, newPath); err != nil {
		return false, err
	}
	if err := verifyChecksum(newPath, sumsURL); err != nil {
		os.Remove(newPath)
		return false, err
	}
	if err := svc.WithPrintLock(func() error { return swapAndRestart(exe, newPath) }); err != nil {
		os.Remove(newPath)
		return false, err
	}
	log.Printf("started %s; exiting", rel.TagName)
	return true, nil
}

func latestRelease() (*ghRelease, [3]int, error) {
	var releases []ghRelease
	if err := getJSON(releasesURL, &releases); err != nil {
		return nil, [3]int{}, err
	}
	var best *ghRelease
	var bestV [3]int
	for i := range releases {
		r := &releases[i]
		if r.Draft || r.Prerelease || !strings.HasPrefix(r.TagName, tagPrefix) {
			continue
		}
		v, ok := parseSemver(strings.TrimPrefix(r.TagName, tagPrefix))
		if ok && (best == nil || newer(v, bestV)) {
			best, bestV = r, v
		}
	}
	return best, bestV, nil
}

// swapAndRestart replaces the running exe (Windows allows renaming it, not
// overwriting it) and starts the new one, which waits for this process to exit.
func swapAndRestart(exe, newPath string) error {
	old := exe + ".old"
	os.Remove(old)
	if err := os.Rename(exe, old); err != nil {
		return fmt.Errorf("move current binary aside: %w", err)
	}
	if err := os.Rename(newPath, exe); err != nil {
		os.Rename(old, exe)
		return fmt.Errorf("move new binary into place: %w", err)
	}
	if err := exec.Command(exe, "--after-update").Start(); err != nil {
		os.Rename(exe, newPath)
		os.Rename(old, exe)
		return fmt.Errorf("start new binary: %w", err)
	}
	return nil
}

// removeOldBinary deletes the exe left by the previous update. It fails silently
// while the old process is still exiting; the next check retries.
func removeOldBinary() {
	if exe, err := currentExe(); err == nil {
		os.Remove(exe + ".old")
	}
}

func currentExe() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(exe)
}

func verifyChecksum(path, sumsURL string) error {
	sums, err := fetchChecksums(sumsURL)
	if err != nil {
		return err
	}
	want, ok := sums[exeAsset]
	if !ok {
		return fmt.Errorf("%s has no entry for %s", checksumsAsset, exeAsset)
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != want {
		return fmt.Errorf("checksum mismatch for %s: got %s, want %s", exeAsset, got, want)
	}
	return nil
}

// fetchChecksums parses "<sha256hex>  <filename>" lines.
func fetchChecksums(url string) (map[string]string, error) {
	res, err := get(url)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	sums := map[string]string{}
	sc := bufio.NewScanner(res.Body)
	for sc.Scan() {
		if f := strings.Fields(sc.Text()); len(f) == 2 {
			sums[f[1]] = strings.ToLower(f[0])
		}
	}
	return sums, sc.Err()
}

func download(url, dest string) error {
	res, err := get(url)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, res.Body); err != nil {
		f.Close()
		os.Remove(dest)
		return err
	}
	return f.Close()
}

func getJSON(url string, v any) error {
	res, err := get(url)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	return json.NewDecoder(res.Body).Decode(v)
}

func get(url string) (*http.Response, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "itcomprint-agent/"+version)
	req.Header.Set("Accept", "application/vnd.github+json")
	res, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		res.Body.Close()
		return nil, fmt.Errorf("GET %s: %s", url, res.Status)
	}
	return res, nil
}

func assetURL(r *ghRelease, name string) string {
	for _, a := range r.Assets {
		if a.Name == name {
			return a.URL
		}
	}
	return ""
}

func parseSemver(s string) ([3]int, bool) {
	var v [3]int
	parts := strings.Split(strings.SplitN(s, "-", 2)[0], ".")
	if len(parts) != 3 {
		return v, false
	}
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil {
			return v, false
		}
		v[i] = n
	}
	return v, true
}

func newer(a, b [3]int) bool {
	for i := range a {
		if a[i] != b[i] {
			return a[i] > b[i]
		}
	}
	return false
}
```

- [ ] **Step 2: Replace `agent/main.go`**

```go
// Command itcomprint-agent is the ITCOM print agent: a Windows tray app that
// relays raw TSPL from the ITCOM web app (over 127.0.0.1) to a USB label printer.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"slices"
	"time"

	"fyne.io/systray"

	"github.com/mirzakhalov03/itcomprint-frontend/agent/printers"
)

// Set at build time via -ldflags -X (see .github/workflows/agent-release.yml).
var (
	version        = "0.0.0-dev"
	allowedOrigins = ""
)

const listenAddr = "127.0.0.1:17171"

func main() {
	closeLog := setupLogging()
	defer closeLog()
	log.Printf("ITCOM Print Agent %s starting", version)

	// Right after a self-update the previous process is still shutting down, so
	// wait for it to release the instance mutex and the port instead of exiting.
	var wait time.Duration
	if slices.Contains(os.Args[1:], "--after-update") {
		wait = 15 * time.Second
	}
	if !acquireSingleInstance(wait) {
		log.Print("another agent is already running; exiting")
		return
	}
	removeOldBinary()

	svc := printers.NewService(loadConfig().SelectedID, func(id string) {
		if err := saveConfig(config{SelectedID: id}); err != nil {
			log.Printf("save config: %v", err)
		}
	})
	srv := &http.Server{Handler: newServer(svc, parseOrigins(allowedOrigins)), ReadHeaderTimeout: 10 * time.Second}

	fatal := ""
	if ln, err := listenWithRetry(listenAddr, wait); err != nil {
		log.Printf("listen %s: %v", listenAddr, err)
		fatal = "Port 17171 in use"
	} else {
		go func() {
			if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
				log.Printf("serve: %v", err)
			}
		}()
		log.Printf("listening on %s", listenAddr)
		go runUpdater(svc, systray.Quit)
	}

	runTray(svc, fatal)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
	log.Print("stopped")
}
```

- [ ] **Step 3: Vet and build**

From `agent/`: `go vet ./... && go build -o dist/itcomprint-agent.exe .`
Expected: exit 0. Running the dev build logs "dev build: auto-update disabled". The end-to-end update path is verified in Task 8 against a real release.

- [ ] **Step 4: Commit**

```bash
git add agent
git commit -m "feat(agent): self-update from agent-v* GitHub Releases with checksum verification"
```

---

### Task 5: Installer, release workflow, agent README

**Files:**

- Create: `agent/installer/agent.iss`
- Create: `.github/workflows/agent-release.yml`
- Create: `agent/README.md`

**Interfaces:**

- Consumes: `agent/` builds with `-X main.version` / `-X main.allowedOrigins`; GitHub repo variable `AGENT_ALLOWED_ORIGINS`.
- Produces: release assets `itcomprint-agent.exe`, `ITCOM-Print-Agent-Setup.exe`, `checksums.txt` (format `<sha256hex>  <name>`). Consumed by Task 4's updater and Task 7's download link.

- [ ] **Step 1: Write `agent/installer/agent.iss`**

```ini
; Per-user installer for the ITCOM Print Agent. Built by .github/workflows/agent-release.yml.
#define AppVersion GetEnv("AGENT_VERSION")

[Setup]
AppId={{B7E1C0E2-4F3A-4C1B-9E55-2D7A1F0C9A11}
AppName=ITCOM Print Agent
AppVersion={#AppVersion}
AppPublisher=IT Community of Uzbekistan
DefaultDirName={localappdata}\Programs\ITCOM Print Agent
PrivilegesRequired=lowest
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
OutputDir=..\dist
OutputBaseFilename=ITCOM-Print-Agent-Setup
UninstallDisplayName=ITCOM Print Agent
UninstallDisplayIcon={app}\itcomprint-agent.exe
Compression=lzma2
SolidCompression=yes

[Files]
Source: "..\dist\itcomprint-agent.exe"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "ITCOMPrintAgent"; ValueData: """{app}\itcomprint-agent.exe"""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\itcomprint-agent.exe"; Flags: nowait skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM itcomprint-agent.exe"; Flags: runhidden; RunOnceId: "StopAgent"

[Code]
// A running agent locks its exe; stop it so a reinstall can replace the file.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM itcomprint-agent.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;
```

- [ ] **Step 2: Write `.github/workflows/agent-release.yml`**

```yaml
name: Agent release

on:
  push:
    tags: ['agent-v*']

permissions:
  contents: write

jobs:
  release:
    runs-on: windows-latest
    defaults:
      run:
        shell: pwsh
        working-directory: agent
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version-file: agent/go.mod
          cache-dependency-path: agent/go.sum

      - name: Build agent
        env:
          GOOS: windows
          GOARCH: amd64
          CGO_ENABLED: '0'
          ORIGINS: ${{ vars.AGENT_ALLOWED_ORIGINS }}
        run: |
          if (-not $env:ORIGINS) { throw "Set the AGENT_ALLOWED_ORIGINS repository variable first." }
          $version = "${{ github.ref_name }}".Substring("agent-v".Length)
          "AGENT_VERSION=$version" >> $env:GITHUB_ENV
          New-Item -ItemType Directory -Force dist | Out-Null
          go build -trimpath -ldflags "-s -w -H windowsgui -X main.version=$version -X main.allowedOrigins=$env:ORIGINS" -o dist/itcomprint-agent.exe .

      - name: Build installer
        run: |
          choco install innosetup --no-progress -y
          & "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" installer\agent.iss

      - name: Checksums
        run: |
          Get-ChildItem dist -Filter *.exe | ForEach-Object {
            "{0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name
          } | Set-Content -Encoding ascii dist/checksums.txt

      - uses: softprops/action-gh-release@v2
        with:
          files: |
            agent/dist/itcomprint-agent.exe
            agent/dist/ITCOM-Print-Agent-Setup.exe
            agent/dist/checksums.txt
```

- [ ] **Step 3: Write `agent/README.md`**

````markdown
# ITCOM Print Agent

Windows tray app that lets the hosted ITCOM web app print badges to a USB label printer, with or without the printer's driver installed. The browser builds the TSPL job; the agent relays the bytes over `http://127.0.0.1:17171`.

Why it exists, the API and all behaviour: `docs/superpowers/specs/2026-10-29-windows-print-agent-design.md`.

## Develop

Needs Go (`winget install GoLang.Go`). From `agent/`:

```bash
go vet ./... && go build -o dist/itcomprint-agent.exe . && ./dist/itcomprint-agent.exe
```

Dev builds (`0.0.0-dev`) log to the console as well as `%LOCALAPPDATA%\ITCOM Print Agent\agent.log`, accept only `http://localhost:5173`, and never self-update. Run the frontend without `VITE_PRINTER_MODE=preview` to use the agent.

## Release

1. Once: in GitHub → Settings → Secrets and variables → Actions → **Variables**, set `AGENT_ALLOWED_ORIGINS` to the production frontend origin(s), comma-separated, no trailing slash (e.g. `https://print.itcom.uz`).
2. Bump `MIN_AGENT_VERSION` in `src/printer/AgentPrinter.ts` only if the app now needs the new agent.
3. Tag and push: `git tag agent-v0.2.0 && git push origin agent-v0.2.0`.

The workflow builds the exe, the installer and `checksums.txt` and attaches them to the release. Installed agents pick it up within 6 hours, or on next login.

These must stay the only GitHub Releases in this repo: the app's download link is `releases/latest/download/ITCOM-Print-Agent-Setup.exe`.

## Set up a laptop

Printer page → **Download print agent** → run it (SmartScreen: _More info → Run anyway_) → allow local network access when the browser asks → **Print test label**.
````

- [ ] **Step 4: Check the installer locally**

Install Inno Setup (`winget install --id JRSoftware.InnoSetup -e`). Then from `agent/`, in PowerShell:

```powershell
go build -ldflags "-H windowsgui -X main.version=0.0.1" -o dist/itcomprint-agent.exe .
$env:AGENT_VERSION = "0.0.1"
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" installer\agent.iss
.\dist\ITCOM-Print-Agent-Setup.exe
```

Expected:

1. No admin (UAC) prompt.
2. Files land in `%LOCALAPPDATA%\Programs\ITCOM Print Agent`, the tray icon appears, and `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` has `ITCOMPrintAgent`.
3. Running the setup again while the agent is running succeeds.
4. Uninstalling from Settings → Apps stops the agent and removes the Run value.

(If winget installs Inno per-user, ISCC is under `%LOCALAPPDATA%\Programs\Inno Setup 6\` instead.)

- [ ] **Step 5: Commit**

```bash
git add agent/installer agent/README.md .github/workflows/agent-release.yml
git commit -m "feat(agent): per-user installer and tagged release workflow"
```

---

### Task 6: Frontend runtime printer detection and agent adapter

**Files:**

- Modify: `src/printer/PrinterAdapter.ts`
- Create: `src/printer/agentClient.ts`, `src/printer/AgentPrinter.ts`, `src/printer/AgentMissingPrinter.ts`, `src/printer/detectPrinter.ts`
- Delete: `src/printer/createPrinter.ts`
- Modify: `src/store/printerStore.ts` (full rewrite below)
- Modify: `src/hooks/usePrintAttendee.ts:48-53,70`

**Interfaces:**

- Consumes: the agent HTTP contract from Task 2.
- Produces:
  - `type PrinterKind = 'preview' | 'webusb' | 'agent' | 'agent-missing'`
  - `agentClient.status(timeoutMs?) / selectPrinter(id) / print(bytes)`; types `AgentStatus`, `AgentPrinterInfo`; `const AGENT_DOWNLOAD_URL`
  - `class AgentPrinter` with `info: AgentStatus`, `selected`, `selectPrinter(id)`, `startPolling()`, `stopPolling()`; `MIN_AGENT_VERSION`; `isAgentOutdated(version): boolean`
  - `detectPrinter(hooks: DetectHooks): Promise<PrinterAdapter>`
  - Store: `adapter: PrinterAdapter | null`, `status: PrinterStatus | 'detecting'`, `agentInfo: AgentStatus | null`, `redetect()`, `selectAgentPrinter(id)`; `connectPrinterWithToast` / `disconnectPrinterWithToast` unchanged.

- [ ] **Step 1: Update `src/printer/PrinterAdapter.ts`**

Replace the `PrinterStatus` line and the interface's `kind` with:

```ts
export type PrinterStatus = 'disconnected' | 'connected';

export type PrinterKind = 'preview' | 'webusb' | 'agent' | 'agent-missing';

export interface PrinterAdapter {
  readonly kind: PrinterKind;
  status: PrinterStatus;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  print(job: PrintJob): Promise<void>;
}
```

- [ ] **Step 2: Create `src/printer/agentClient.ts`**

```ts
/** Typed calls to the Windows print agent on this machine (see agent/README.md). */

export interface AgentPrinterInfo {
  id: string;
  name: string;
  transport: 'queue' | 'usb';
}

export interface AgentStatus {
  version: string;
  hostname: string;
  printers: AgentPrinterInfo[];
  selectedId: string | null;
}

const AGENT_URL: string = import.meta.env.VITE_AGENT_URL ?? 'http://127.0.0.1:17171';

// Agent releases are the only GitHub Releases in this repo, so "latest" is the newest agent.
export const AGENT_DOWNLOAD_URL =
  'https://github.com/mirzakhalov03/itcomprint-frontend/releases/latest/download/ITCOM-Print-Agent-Setup.exe';

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 5000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new Error('The print agent is not reachable. Is it running?', { cause: e });
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Print agent error (${res.status})`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const agentClient = {
  status: (timeoutMs?: number) => call<AgentStatus>('/status', {}, timeoutMs),
  selectPrinter: (id: string) =>
    call<AgentStatus>('/printer', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }),
  // Labels can take a while when the printer is mid-batch; the agent itself gives up at 15 s.
  print: (tspl: Uint8Array<ArrayBuffer>) =>
    call<void>(
      '/print',
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: tspl },
      30_000,
    ),
};
```

- [ ] **Step 3: Create `src/printer/AgentPrinter.ts`**

```ts
import { agentClient, type AgentPrinterInfo, type AgentStatus } from './agentClient';
import type { PrinterAdapter, PrinterStatus, PrintJob } from './PrinterAdapter';

/** Oldest agent this app works with. Bump only when the app relies on a newer agent API. */
export const MIN_AGENT_VERSION = '0.1.0';

const POLL_MS = 10_000;

export interface AgentHooks {
  /** The agent's printers or selection changed (from polling or a user action). */
  onChange: () => void;
  /** The agent stopped answering; the store re-detects. */
  onLost: () => void;
}

/** Prints through the ITCOM print agent on this Windows machine. */
export class AgentPrinter implements PrinterAdapter {
  readonly kind = 'agent' as const;
  status: PrinterStatus;
  info: AgentStatus;
  private readonly hooks: AgentHooks;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(info: AgentStatus, hooks: AgentHooks) {
    this.info = info;
    this.status = statusOf(info);
    this.hooks = hooks;
  }

  get selected(): AgentPrinterInfo | undefined {
    return this.info.printers.find((p) => p.id === this.info.selectedId);
  }

  async connect(): Promise<void> {
    this.apply(await agentClient.status());
  }

  // Nothing to unpair: the agent owns the printer connection.
  async disconnect(): Promise<void> {}

  async print(job: PrintJob): Promise<void> {
    await agentClient.print(job.tspl);
  }

  async selectPrinter(id: string): Promise<void> {
    this.apply(await agentClient.selectPrinter(id));
  }

  /** Keeps status live, so unplugging the printer turns the pill red without a print attempt. */
  startPolling(): void {
    this.stopPolling();
    this.timer = setInterval(() => void this.poll(), POLL_MS);
  }

  stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    try {
      this.apply(await agentClient.status());
    } catch {
      this.stopPolling();
      this.hooks.onLost();
    }
  }

  private apply(info: AgentStatus): void {
    this.info = info;
    this.status = statusOf(info);
    this.hooks.onChange();
  }
}

function statusOf(info: AgentStatus): PrinterStatus {
  return info.printers.some((p) => p.id === info.selectedId) ? 'connected' : 'disconnected';
}

/** True when the agent is older than MIN_AGENT_VERSION. Dev builds never count as outdated. */
export function isAgentOutdated(version: string): boolean {
  if (version.includes('-dev')) return false;
  const parse = (v: string) => v.split('-')[0].split('.').map(Number);
  const have = parse(version);
  const need = parse(MIN_AGENT_VERSION);
  for (let i = 0; i < 3; i++) {
    const a = have[i] ?? 0;
    const b = need[i] ?? 0;
    if (a !== b) return a < b;
  }
  return false;
}
```

- [ ] **Step 4: Create `src/printer/AgentMissingPrinter.ts`**

```ts
import type { PrinterAdapter, PrinterStatus } from './PrinterAdapter';

/**
 * Windows with no print agent answering. WebUSB can't claim a printer that a
 * Windows driver owns, so nothing prints until the agent is installed or started.
 * The store's connect() re-detects for this adapter ("Check again").
 */
export class AgentMissingPrinter implements PrinterAdapter {
  readonly kind = 'agent-missing' as const;
  status: PrinterStatus = 'disconnected';

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  async print(): Promise<void> {
    throw new Error('Install the ITCOM print agent to print on Windows. See the Printer page.');
  }
}
```

- [ ] **Step 5: Create `src/printer/detectPrinter.ts` and delete `createPrinter.ts`**

```ts
import { agentClient } from './agentClient';
import { AgentMissingPrinter } from './AgentMissingPrinter';
import { AgentPrinter, type AgentHooks } from './AgentPrinter';
import type { PrinterAdapter, PrintJob } from './PrinterAdapter';
import { PreviewPrinter } from './PreviewPrinter';
import { WebUsbPrinter } from './WebUsbPrinter';

const PROBE_TIMEOUT_MS = 1000;

export interface DetectHooks extends AgentHooks {
  onPreview: (job: PrintJob) => void;
}

/**
 * Picks how this browser prints, at runtime: forced preview → print agent →
 * agent setup (Windows) → WebUSB (Mac/Linux) → on-screen preview.
 */
export async function detectPrinter(hooks: DetectHooks): Promise<PrinterAdapter> {
  if (import.meta.env.VITE_PRINTER_MODE === 'preview') return new PreviewPrinter(hooks.onPreview);
  try {
    return new AgentPrinter(await agentClient.status(PROBE_TIMEOUT_MS), hooks);
  } catch {
    // No agent answering on this machine. Fall through.
  }
  if (isWindows()) return new AgentMissingPrinter();
  if ('usb' in navigator) return new WebUsbPrinter();
  return new PreviewPrinter(hooks.onPreview);
}

function isWindows(): boolean {
  const uaData = (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData;
  return uaData ? uaData.platform === 'Windows' : /Windows/.test(navigator.userAgent);
}
```

```bash
git rm src/printer/createPrinter.ts
```

- [ ] **Step 6: Rewrite `src/store/printerStore.ts`**

```ts
import { create } from 'zustand';
import type { PrinterAdapter, PrinterStatus } from '../printer/PrinterAdapter';
import { detectPrinter, type DetectHooks } from '../printer/detectPrinter';
import { AgentPrinter } from '../printer/AgentPrinter';
import type { AgentStatus } from '../printer/agentClient';
import { errMessage } from '../lib/errors';
import { usePreviewStore } from './previewStore';
import { toast } from './toastStore';
import { api } from '../lib/api';

// Windows without the agent: keep looking, so installing it flips the app over by itself.
const MISSING_RECHECK_MS = 15_000;

interface PrinterState {
  /** null until the first detection resolves. */
  adapter: PrinterAdapter | null;
  status: PrinterStatus | 'detecting';
  /** Latest agent report (printers, selection, version); null unless the agent adapter is active. */
  agentInfo: AgentStatus | null;
  error: string | null;
  /** Print two copies of each badge. Session-only: every kiosk load starts checked. */
  double: boolean;
  setDouble: (double: boolean) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Re-run detection: after the agent is installed or started, or when it stops answering. */
  redetect: () => Promise<void>;
  selectAgentPrinter: (id: string) => Promise<void>;
}

let detecting: Promise<void> | null = null;
let recheckTimer: ReturnType<typeof setTimeout> | null = null;

export const usePrinterStore = create<PrinterState>((set, get) => {
  const hooks: DetectHooks = {
    onPreview: (job) => usePreviewStore.getState().add(job),
    onChange: () => {
      const { adapter, status } = get();
      if (!(adapter instanceof AgentPrinter)) return;
      // Plugging/unplugging shows up here via polling; log it like a WebUSB connect/disconnect.
      if (status !== 'detecting' && adapter.status !== status) {
        reportPrinter(adapter.status === 'connected' ? 'connect' : 'disconnect');
      }
      set({ status: adapter.status, agentInfo: adapter.info });
    },
    onLost: () => void get().redetect(),
  };

  function redetect(): Promise<void> {
    detecting ??= (async () => {
      const prev = get().adapter;
      const wasConnected = prev instanceof AgentPrinter && prev.status === 'connected';
      if (prev instanceof AgentPrinter) prev.stopPolling();
      if (recheckTimer) clearTimeout(recheckTimer);

      const adapter = await detectPrinter(hooks);
      if (adapter instanceof AgentPrinter) adapter.startPolling();
      if (adapter.kind === 'agent-missing') {
        recheckTimer = setTimeout(() => void redetect(), MISSING_RECHECK_MS);
      }
      if (wasConnected && adapter.status !== 'connected') reportPrinter('disconnect');
      set({
        adapter,
        status: adapter.status,
        agentInfo: adapter instanceof AgentPrinter ? adapter.info : null,
        error: null,
      });
    })().finally(() => {
      detecting = null;
    });
    return detecting;
  }

  return {
    adapter: null,
    status: 'detecting',
    agentInfo: null,
    error: null,
    double: true,
    setDouble: (double) => set({ double }),
    connect: async () => {
      const { adapter } = get();
      if (!adapter) return;
      if (adapter.kind === 'agent-missing') {
        await redetect();
        if (get().adapter?.kind === 'agent-missing') {
          set({ error: 'Print agent not found. Is it installed and running?' });
        }
        return;
      }
      try {
        await adapter.connect();
        set({ status: adapter.status, error: null });
      } catch (e) {
        set({ error: errMessage(e, 'Failed to connect') });
      }
    },
    disconnect: async () => {
      const { adapter } = get();
      if (!adapter) return;
      await adapter.disconnect();
      set({ status: adapter.status, error: null });
    },
    redetect,
    selectAgentPrinter: async (id) => {
      const { adapter } = get();
      if (adapter instanceof AgentPrinter) await adapter.selectPrinter(id);
    },
  };
});

void usePrinterStore.getState().redetect();

/** Connect the printer and surface the outcome as a toast. Shared by the
 *  header status pill and the Printer page so the connect-and-notify flow
 *  lives in one place. */
export async function connectPrinterWithToast(eventId?: string) {
  await usePrinterStore.getState().connect();
  const s = usePrinterStore.getState();
  if (s.status === 'connected') {
    toast('Printer connected');
    reportPrinter('connect', eventId);
  } else if (s.error) toast(s.error);
}

export async function disconnectPrinterWithToast(eventId?: string) {
  await usePrinterStore.getState().disconnect();
  toast('Printer disconnected');
  reportPrinter('disconnect', eventId);
}

// Printer state lives only in this browser, so it's reported for the activity log.
// Best-effort: a failed log must not undo or block the connect.
function reportPrinter(action: 'connect' | 'disconnect', eventId?: string) {
  api.logPrinterActivity(action, eventId ?? null).catch(() => {});
}
```

- [ ] **Step 7: Update `src/hooks/usePrintAttendee.ts`**

Replace the connected check (lines 48-53):

```ts
const { adapter, double } = usePrinterStore.getState();
const copies = double ? 2 : 1;
if (!adapter || adapter.status !== 'connected') {
  throw new Error(notReadyMessage(adapter?.kind));
}
```

Replace the toast line in `onSuccess` (line 70):

```ts
if (usePrinterStore.getState().adapter?.kind !== 'preview') toast('Sent to printer');
```

Add below `markPrinted`:

```ts
function notReadyMessage(kind: PrinterKind | undefined): string {
  if (kind === 'agent') return 'Printer not found. Check the USB cable and that the printer is on.';
  if (kind === 'agent-missing')
    return 'Printing on Windows needs the ITCOM print agent. See the Printer page.';
  if (kind === undefined) return 'Still looking for a printer. Try again in a moment.';
  return 'Printer not connected. Click "Connect printer" first.';
}
```

and add the import: `import type { PrinterKind } from '../printer/PrinterAdapter';`

- [ ] **Step 8: Typecheck**

Run: `npm run validate`
Expected: `tsc` fails **only** in `src/hooks/usePrinterPresentation.ts` (it reads `adapter.kind` on the now-nullable adapter); Task 7 rewrites that file. Any other error must be fixed now.

- [ ] **Step 9: Commit**

lint-staged runs only eslint + prettier on staged files (no `tsc`), so this commit goes through. The branch typechecks again after Task 7.

```bash
git add src/printer src/store/printerStore.ts src/hooks/usePrintAttendee.ts
git commit -m "feat(printer): detect print agent / WebUSB / preview at runtime"
```

---

### Task 7: Printer UI: header pill, Printer page, test label

**Files:**

- Modify: `src/hooks/usePrinterPresentation.ts` (full rewrite)
- Modify: `src/components/PrinterStatus.tsx` (full rewrite)
- Modify: `src/pages/PrinterPage.tsx` (full rewrite)
- Create: `src/components/AgentPrinterPanel.tsx`, `src/components/AgentSetupPanel.tsx`, `src/printer/testLabel.ts`

**Interfaces:**

- Consumes: store fields/actions from Task 6, `AGENT_DOWNLOAD_URL`, `isAgentOutdated`, `useTemplates`, `renderBadgeToCanvas`, `canvasToMonochromeBitmap`, `buildBadgeTSPL`, `newStaticZone`.
- Produces: `usePrinterPresentation()` → `{ kind, connected, agentInfo, agentOutdated, pillLabel, tone, showConnect, showDisconnect, showCheckAgain }`; `type PrinterTone = 'preview' | 'ok' | 'bad' | 'neutral'`; `buildTestLabelJob(hostname, size): Promise<PrintJob>`.

- [ ] **Step 1: Rewrite `src/hooks/usePrinterPresentation.ts`**

```ts
import { usePrinterStore } from '../store/printerStore';
import { isAgentOutdated } from '../printer/AgentPrinter';
import type { PrinterKind } from '../printer/PrinterAdapter';

export type PrinterTone = 'preview' | 'ok' | 'bad' | 'neutral';

/**
 * Shared read of printer state for the UI: which path this browser prints through,
 * whether it's ready, the header pill's label/tone, and which action to offer.
 * The header pill and the Printer page map these to their own layouts.
 */
export function usePrinterPresentation() {
  const adapter = usePrinterStore((s) => s.adapter);
  const status = usePrinterStore((s) => s.status);
  const agentInfo = usePrinterStore((s) => s.agentInfo);
  const kind = adapter?.kind ?? null;
  const connected = status === 'connected';
  const agentOutdated =
    kind === 'agent' && agentInfo !== null && isAgentOutdated(agentInfo.version);

  return {
    kind,
    connected,
    agentInfo,
    agentOutdated,
    pillLabel: pillLabel(kind, connected, agentOutdated),
    tone: toneOf(kind, connected, agentOutdated),
    showConnect: kind === 'webusb' && !connected,
    showDisconnect: kind === 'webusb' && connected,
    showCheckAgain: kind === 'agent-missing',
  };
}

function pillLabel(kind: PrinterKind | null, connected: boolean, outdated: boolean): string {
  switch (kind) {
    case null:
      return 'Checking printer…';
    case 'preview':
      return 'Preview mode';
    case 'agent-missing':
      return 'Set up printing';
    case 'agent':
      if (outdated) return 'Update print agent';
      return connected ? 'Printer connected' : 'Printer not found';
    case 'webusb':
      return connected ? 'Printer connected' : 'Printer not connected';
  }
}

function toneOf(kind: PrinterKind | null, connected: boolean, outdated: boolean): PrinterTone {
  if (kind === null) return 'neutral';
  if (kind === 'preview') return 'preview';
  return connected && !outdated ? 'ok' : 'bad';
}
```

- [ ] **Step 2: Rewrite `src/components/PrinterStatus.tsx`**

The pill now links to the Printer page, so "Set up printing" on the kiosk leads straight to setup.

```tsx
import { Link } from 'react-router-dom';
import { connectPrinterWithToast, disconnectPrinterWithToast } from '../store/printerStore';
import { usePrinterPresentation, type PrinterTone } from '../hooks/usePrinterPresentation';
import { CloseIcon, PlugIcon, RefreshIcon } from './icons';
import { Button } from './ui/Button';

const PILL: Record<PrinterTone, string> = {
  preview: 'bg-ink-2 text-white',
  ok: 'bg-brand text-white',
  bad: 'border border-danger text-danger',
  neutral: 'border border-line-2 text-muted',
};

const DOT: Record<PrinterTone, string> = {
  preview: 'bg-brand',
  ok: 'bg-white',
  bad: 'bg-danger',
  neutral: 'bg-faint',
};

const ACTION =
  'h-[38px] shrink-0 gap-[7px] rounded-full px-3 text-[13px] tracking-[.02em] sm:px-[18px]';

/**
 * Printer state pill (links to the Printer page) + the one action that fits:
 * Connect / Disconnect for WebUSB, Check again when the Windows agent is missing.
 */
export function PrinterStatus({ eventId }: { eventId?: string }) {
  const { pillLabel, tone, showConnect, showDisconnect, showCheckAgain } = usePrinterPresentation();

  return (
    <div className="relative flex shrink-0 items-center gap-2">
      <Link
        to="/app/printer"
        title={pillLabel}
        className={`inline-flex h-[38px] shrink-0 items-center gap-2 rounded-full px-3 font-display text-[13px] font-semibold tracking-[.01em] transition-opacity hover:opacity-90 sm:px-4 ${PILL[tone]}`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} />
        <span className="hidden sm:inline">{pillLabel}</span>
      </Link>
      {showConnect && (
        <Button
          onClick={() => connectPrinterWithToast(eventId)}
          aria-label="Connect printer"
          className={ACTION}
        >
          <PlugIcon size={15} strokeWidth={2.4} />
          <span className="hidden sm:inline">Connect printer</span>
        </Button>
      )}
      {showCheckAgain && (
        <Button
          onClick={() => connectPrinterWithToast(eventId)}
          aria-label="Check for the print agent"
          className={ACTION}
        >
          <RefreshIcon size={15} strokeWidth={2.4} />
          <span className="hidden sm:inline">Check again</span>
        </Button>
      )}
      {showDisconnect && (
        <Button
          variant="secondary"
          onClick={() => disconnectPrinterWithToast(eventId)}
          aria-label="Disconnect printer"
          className={ACTION}
        >
          <CloseIcon size={14} strokeWidth={2.4} />
          <span className="hidden sm:inline">Disconnect</span>
        </Button>
      )}
    </div>
  );
}
```

If `RefreshIcon` doesn't accept `strokeWidth` (check `IconProps` in `src/components/icons.tsx`), drop that prop.

- [ ] **Step 3: Create `src/printer/testLabel.ts`**

```ts
import type { BadgeTemplate } from '../types';
import type { PrintJob } from './PrinterAdapter';
import { renderBadgeToCanvas, canvasToMonochromeBitmap } from './renderBadge';
import { buildBadgeTSPL } from './buildBadgeTSPL';
import { newStaticZone } from './zones';

export type LabelSize = Pick<BadgeTemplate, 'labelWidthMm' | 'labelHeightMm'>;

export const FALLBACK_LABEL_SIZE: LabelSize = { labelWidthMm: 80, labelHeightMm: 60 };

/**
 * A label naming this laptop, run through the same render → bitmap → TSPL
 * pipeline as real badges, so a good test print proves the real path.
 */
export async function buildTestLabelJob(hostname: string, size: LabelSize): Promise<PrintJob> {
  const { labelWidthMm, labelHeightMm } = size;
  const template: BadgeTemplate = {
    _id: 'test-label',
    name: 'Test label',
    isDefault: false,
    labelWidthMm,
    labelHeightMm,
    zones: [
      { ...newStaticZone(), staticText: 'ITCOM test', fontSize: 20, bold: true },
      { ...newStaticZone(), staticText: hostname, fontSize: 12 },
      { ...newStaticZone(), staticText: new Date().toLocaleString(), fontSize: 10 },
    ],
  };
  const canvas = await renderBadgeToCanvas({ fullName: '', extra: {} }, template);
  return {
    name: 'Test label',
    tspl: buildBadgeTSPL(canvasToMonochromeBitmap(canvas), labelWidthMm, labelHeightMm, 1),
    previewDataUrl: '',
    labelWidthMm,
    labelHeightMm,
    copies: 1,
  };
}
```

- [ ] **Step 4: Create `src/components/AgentPrinterPanel.tsx`**

```tsx
import { useState } from 'react';
import { usePrinterStore } from '../store/printerStore';
import { usePrinterPresentation } from '../hooks/usePrinterPresentation';
import { useTemplates } from '../hooks/useTemplates';
import { AGENT_DOWNLOAD_URL, type AgentPrinterInfo } from '../printer/agentClient';
import { buildTestLabelJob, FALLBACK_LABEL_SIZE } from '../printer/testLabel';
import { toast } from '../store/toastStore';
import { errMessage } from '../lib/errors';
import { PrinterIcon } from './icons';
import { Button } from './ui/Button';

const TRANSPORT_LABEL: Record<AgentPrinterInfo['transport'], string> = {
  queue: 'Windows print queue',
  usb: 'Direct USB',
};

/** Printer page details when printing goes through the Windows print agent. */
export function AgentPrinterPanel() {
  const { agentInfo, agentOutdated, connected } = usePrinterPresentation();
  const adapter = usePrinterStore((s) => s.adapter);
  const selectAgentPrinter = usePrinterStore((s) => s.selectAgentPrinter);
  const { data: templates } = useTemplates();
  const [testing, setTesting] = useState(false);

  if (!agentInfo) return null;
  const { printers, selectedId, hostname, version } = agentInfo;
  const selected = printers.find((p) => p.id === selectedId);
  const showPicker = printers.length > 1 || selectedId === null;
  const labelSize = templates?.find((t) => t.isDefault) ?? FALLBACK_LABEL_SIZE;

  async function onSelect(id: string) {
    try {
      await selectAgentPrinter(id);
    } catch (e) {
      toast(errMessage(e, 'Could not select that printer'));
    }
  }

  async function onTest() {
    setTesting(true);
    try {
      await adapter?.print(await buildTestLabelJob(hostname, labelSize));
      toast('Test label sent');
    } catch (e) {
      toast(errMessage(e, 'Test print failed'));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mt-5 space-y-4 border-t border-line pt-5">
      {agentOutdated && (
        <div className="rounded-xl border border-amber bg-amber/10 p-3 text-sm text-ink">
          This computer's print agent (v{version}) is older than the app needs.{' '}
          <a href={AGENT_DOWNLOAD_URL} className="font-semibold text-brand-deep underline">
            Download the update
          </a>{' '}
          and run it.
        </div>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">Printer</dt>
        <dd className="text-ink">{selected?.name ?? '—'}</dd>
        <dt className="text-muted">Connection</dt>
        <dd className="text-ink">{selected ? TRANSPORT_LABEL[selected.transport] : '—'}</dd>
        <dt className="text-muted">Agent</dt>
        <dd className="text-ink">
          v{version} on {hostname}
        </dd>
      </dl>

      {showPicker &&
        (printers.length === 0 ? (
          <p className="text-sm text-muted">No USB label printer is plugged in.</p>
        ) : (
          <label className="block text-sm">
            <span className="mb-1.5 block text-muted">Print badges on</span>
            <select
              value={selectedId ?? ''}
              onChange={(e) => void onSelect(e.target.value)}
              className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
            >
              <option value="" disabled>
                Choose a printer…
              </option>
              {printers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({TRANSPORT_LABEL[p.transport]})
                </option>
              ))}
            </select>
          </label>
        ))}

      <Button
        variant="secondary"
        onClick={() => void onTest()}
        disabled={!connected || testing}
        className="h-11 gap-2 rounded-full px-5 text-sm"
      >
        <PrinterIcon size={16} /> {testing ? 'Printing…' : 'Print test label'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/components/AgentSetupPanel.tsx`**

```tsx
import { connectPrinterWithToast } from '../store/printerStore';
import { AGENT_DOWNLOAD_URL } from '../printer/agentClient';
import { DownloadIcon, RefreshIcon } from './icons';
import { Button } from './ui/Button';

/** Printer page on Windows when no print agent is answering. */
export function AgentSetupPanel() {
  return (
    <div className="mt-5 space-y-4 border-t border-line pt-5">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
        <li>
          Download and run the installer. If Windows says "unrecognized app", click{' '}
          <b className="text-ink">More info → Run anyway</b>.
        </li>
        <li>
          When the browser asks to allow access to devices on your local network, click{' '}
          <b className="text-ink">Allow</b>.
        </li>
        <li>This page switches over by itself once the agent is running.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <a
          href={AGENT_DOWNLOAD_URL}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 font-display text-sm font-bold text-white transition-colors hover:bg-brand-strong"
        >
          <DownloadIcon size={16} /> Download print agent
        </a>
        <Button
          variant="secondary"
          onClick={() => connectPrinterWithToast()}
          className="h-11 gap-2 rounded-full px-5 text-sm"
        >
          <RefreshIcon size={15} /> Check again
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Rewrite `src/pages/PrinterPage.tsx`**

```tsx
import { connectPrinterWithToast, disconnectPrinterWithToast } from '../store/printerStore';
import { usePrinterPresentation } from '../hooks/usePrinterPresentation';
import type { PrinterKind } from '../printer/PrinterAdapter';
import { AgentPrinterPanel } from '../components/AgentPrinterPanel';
import { AgentSetupPanel } from '../components/AgentSetupPanel';
import { CloseIcon, PlugIcon, PrinterIcon } from '../components/icons';
import { Button } from '../components/ui/Button';

const KIND_LABEL: Record<PrinterKind, string> = {
  preview: 'Preview',
  webusb: 'WebUSB',
  agent: 'Print agent',
  'agent-missing': 'Print agent',
};

export function PrinterPage() {
  const { kind, connected, showConnect, showDisconnect } = usePrinterPresentation();
  const { label, desc } = describe(kind, connected);

  const iconBox = connected
    ? 'bg-brand text-white'
    : kind === 'preview'
      ? 'bg-ink-2 text-white'
      : 'bg-surface text-muted';

  return (
    <div className="max-w-[560px]">
      <h1 className="mb-5 font-display text-xl font-bold text-ink">Printer</h1>
      <div className="rounded-2xl border border-line bg-white p-6">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconBox}`}>
            <PrinterIcon size={20} />
          </div>
          <div>
            <div className="font-display text-base font-bold text-ink">{label}</div>
            {kind && (
              <div className="text-xs uppercase tracking-wide text-faint">{KIND_LABEL[kind]}</div>
            )}
          </div>
        </div>
        <p className="mt-4 text-sm text-muted">{desc}</p>
        {showConnect && (
          <Button
            onClick={() => connectPrinterWithToast()}
            className="mt-5 h-11 gap-2 rounded-full px-5 text-sm"
          >
            <PlugIcon size={16} /> Connect printer
          </Button>
        )}
        {showDisconnect && (
          <Button
            variant="secondary"
            onClick={() => disconnectPrinterWithToast()}
            className="mt-5 h-11 gap-2 rounded-full px-5 text-sm"
          >
            <CloseIcon size={15} /> Disconnect
          </Button>
        )}
        {kind === 'agent' && <AgentPrinterPanel />}
        {kind === 'agent-missing' && <AgentSetupPanel />}
      </div>
    </div>
  );
}

function describe(kind: PrinterKind | null, connected: boolean): { label: string; desc: string } {
  switch (kind) {
    case null:
      return { label: 'Checking…', desc: 'Looking for a printer on this computer.' };
    case 'preview':
      return {
        label: 'Preview mode',
        desc: 'Badges render to the on-screen preview tray. No physical printer is attached.',
      };
    case 'webusb':
      return connected
        ? {
            label: 'Connected',
            desc: 'A label printer is connected over WebUSB and ready to print.',
          }
        : {
            label: 'Not connected',
            desc: 'Connect your Gainscha label printer over USB to start printing badges.',
          };
    case 'agent':
      return connected
        ? {
            label: 'Connected',
            desc: 'The print agent on this computer sends badges to the printer below.',
          }
        : {
            label: 'Printer not found',
            desc: 'The print agent is running, but the printer is not plugged in or not chosen yet. Check the USB cable and that the printer is on.',
          };
    case 'agent-missing':
      return {
        label: 'Set up printing',
        desc: 'On Windows, badges print through the ITCOM print agent, a small app that runs in the tray. Install it once on this computer.',
      };
  }
}
```

- [ ] **Step 7: Validate**

Run: `npm run validate`
Expected: prettier/eslint clean, `tsc -b` exit 0.

- [ ] **Step 8: Manual check in the browser** (Windows, the Task 4 dev agent built and running, `.env` without `VITE_PRINTER_MODE=preview`, `npm run dev`)

1. Header pill: "Printer connected" (green) with the Gainscha plugged in; the Printer page shows printer, "Windows print queue" or "Direct USB", "v0.0.0-dev on <hostname>".
2. **Print test label** prints a label with the laptop name; a kiosk badge print shows "Sent to printer" and marks the attendee printed.
3. Unplug the printer → within ~10 s the pill reads "Printer not found" (red); printing a badge shows "Printer not found. Check the USB cable…" and the attendee stays unprinted. Replug → green again, no reload.
4. **Review Focus 3:** with the kiosk open, Quit the agent from the tray → within ~10 s the pill reads "Set up printing" with **Check again**; the Printer page shows the setup panel. Start the agent again → within ~15 s the pill is green on its own.
5. On a Mac (or Chrome with no agent and a non-Windows UA): WebUSB Connect/Disconnect behaves exactly as before.
6. `VITE_PRINTER_MODE=preview` in `.env` → preview mode as before.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat(printer): agent status pill, setup and test-label UI on the Printer page"
```

---

### Task 8: Docs, env, and first release

**Files:**

- Modify: `README.md` (env table, Vercel note)
- Modify: `.env.example`
- Modify: `docs/CLAUDE.md` (printing pipeline, env list, known gaps)

**Interfaces:** none (docs + release).

- [ ] **Step 1: Update `.env.example`**

Replace the printer block with:

```bash
# Printer: leave unset to auto-detect (print agent on Windows, WebUSB on Mac),
# or set to "preview" to always render badges on screen (no hardware).
# VITE_PRINTER_MODE=preview

# Windows print agent address. Only change for development.
# VITE_AGENT_URL=http://127.0.0.1:17171
```

- [ ] **Step 2: Update `README.md`**

In the env table, replace the `VITE_PRINTER_MODE` row with:

```markdown
| `VITE_PRINTER_MODE` | Unset = auto-detect (print agent on Windows, WebUSB on Mac). `preview` = on-screen badges only. |
| `VITE_AGENT_URL` | Windows print agent address. Default `http://127.0.0.1:17171`. |
```

Replace the "**Note:** `webusb` printing needs Chrome/Edge…" paragraph with:

```markdown
**Printing:** Chrome/Edge only. On macOS badges print over WebUSB; on Windows they print through the
ITCOM print agent (`agent/`, see `agent/README.md`), which the Printer page offers to download. Leave
`VITE_PRINTER_MODE` unset in Vercel so detection runs.
```

- [ ] **Step 3: Update `docs/CLAUDE.md`**

- In the pipeline diagram, change `→ adapter.print()            PreviewPrinter or WebUsbPrinter` to `→ adapter.print()            Preview, WebUSB or the Windows print agent`.
- Replace the paragraph starting "`PrinterAdapter` has two implementations…", the two bullets after it, and the "UI code never branches…DPI…" paragraph with:

```markdown
`detectPrinter()` picks the `PrinterAdapter` **at runtime** (the store re-runs it via `redetect()`): `VITE_PRINTER_MODE=preview` → `PreviewPrinter`; else the Windows print agent answering on `127.0.0.1:17171` → `AgentPrinter`; else Windows → `AgentMissingPrinter` (Printer page offers the installer); else WebUSB → `WebUsbPrinter`; else preview.

- `PreviewPrinter`: pushes the job into `usePreviewStore`, rendering `previewDataUrl` on screen. Always reports `connected`.
- `WebUsbPrinter`: raw bulk-OUT transfer to the Gainscha (Chrome/Edge). Verified on macOS. Unusable on Windows, where a driver always owns the device.
- `AgentPrinter`: POSTs the same TSPL bytes to the Go agent in `agent/`, which writes them through the printer's Windows queue (RAW) or straight to the `usbprint` device when no driver is installed. Polls `/status` every 10 s so plug/unplug shows without a print attempt. Spec: `docs/superpowers/specs/2026-10-29-windows-print-agent-design.md`; release steps: `agent/README.md`.

UI code reads printer state only through `usePrinterPresentation`. `DPI = 203` is hardcoded in both `renderBadge.ts` and `buildBadgeTSPL.ts`; change both together.
```

- In the Environment line, replace `VITE_PRINTER_MODE` with `VITE_PRINTER_MODE` (optional, `preview` forces preview), `VITE_AGENT_URL`.
- In the activity-log bullet, change "(WebUSB state is client-only)" to "(printer state is client-only)".
- In Known gaps, delete the "**The hardware spike has never been run.**…" bullet and add: `- **The Windows agent is unsigned.** SmartScreen asks once per laptop (*More info → Run anyway*).`

- [ ] **Step 4: Validate and commit**

```bash
npm run validate
git add README.md .env.example docs/CLAUDE.md
git commit -m "docs: runtime printer detection and the Windows print agent"
```

- [ ] **Step 5: Release (needs the user: these are outward-facing)**

Ask the user to confirm each of these before doing it:

1. The production frontend origin, then set the repo variable: GitHub → `itcomprint-frontend` → Settings → Secrets and variables → Actions → Variables → `AGENT_ALLOWED_ORIGINS`.
2. In Vercel, remove `VITE_PRINTER_MODE` if it is set to `preview` (otherwise production never detects the agent).
3. Push the branch, open a PR, and merge it to `main` (Vercel deploys the frontend).
4. `git tag agent-v0.1.0 && git push origin agent-v0.1.0`, then watch the "Agent release" workflow go green and the release show three assets.

- [ ] **Step 6: Release verification (spec's checklist)**

1. Fresh Windows laptop **with** the Gainscha driver: Printer page → Download → install → allow local network access → **Print test label** prints via "Windows print queue".
2. Laptop **without** the driver: same flow prints via "Direct USB".
3. Unplug/replug: pill red → green without reload.
4. Quit the agent from the tray: app falls to "Set up printing"; start it again → green within ~15 s.
5. Tag `agent-v0.1.1` (any trivial change). On a laptop running 0.1.0, quit and restart the agent → within ~30 s the log shows `updating 0.1.0 → agent-v0.1.1`, the tray menu shows "Version 0.1.1", and `itcomprint-agent.exe.old` is gone after the next check.
6. Mac: WebUSB flow unchanged.
7. In DevTools on any other site: `fetch('http://127.0.0.1:17171/status')` fails (403 / CORS).
