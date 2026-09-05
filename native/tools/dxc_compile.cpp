// Minimal standalone DXC API client. Uses the headers/library shipped with UE;
// no editor, rendering device, engine module, or GPU is initialized.
#include <dxc/dxcapi.h>
#include <chrono>
#include <codecvt>
#include <fstream>
#include <iostream>
#include <locale>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

template <class T> struct Interface {
  T* value = nullptr;
  ~Interface() { if (value) value->Release(); }
  T* operator->() const { return value; }
  void** address() { return reinterpret_cast<void**>(&value); }
};

static void require(HRESULT hr, const char* operation) {
  if (FAILED(hr)) {
    std::ostringstream message;
    message << operation << " failed, HRESULT=0x" << std::hex << static_cast<unsigned>(hr);
    throw std::runtime_error(message.str());
  }
}

int main(int argc, char** argv) {
  if (argc < 6) {
    std::cerr << "Usage: dxc_compile LIBRARY SOURCE ENTRY PROFILE OUTPUT [DXC_ARGUMENT ...]\n";
    return 2;
  }
  // Keep the library resident until process exit: every COM-style object must
  // be destroyed while its implementation's code is still mapped.
  void* library = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
  if (!library) { std::cerr << "dlopen: " << dlerror() << '\n'; return 2; }
  try {
    auto create = reinterpret_cast<DxcCreateInstanceProc>(dlsym(library, "DxcCreateInstance"));
    if (!create) throw std::runtime_error("DxcCreateInstance symbol missing");
    Interface<IDxcCompiler3> compiler;
    Interface<IDxcUtils> utilities;
    require(create(CLSID_DxcCompiler, __uuidof(IDxcCompiler3), compiler.address()), "create compiler");
    require(create(CLSID_DxcUtils, __uuidof(IDxcUtils), utilities.address()), "create utilities");
    Interface<IDxcVersionInfo> version;
    if (SUCCEEDED(compiler->QueryInterface(__uuidof(IDxcVersionInfo), version.address()))) {
      UINT32 major = 0, minor = 0, flags = 0;
      require(version->GetVersion(&major, &minor), "compiler version");
      require(version->GetFlags(&flags), "compiler flags");
      std::cout << "DXC_VERSION " << major << '.' << minor << " FLAGS " << flags << '\n';
    }
    std::ifstream file(argv[2], std::ios::binary);
    if (!file) throw std::runtime_error("Cannot read source file");
    const std::string source((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    std::wstring_convert<std::codecvt_utf8<wchar_t>> conversion;
    std::vector<std::wstring> arguments;
    auto add = [&](const char* value) { arguments.push_back(conversion.from_bytes(value)); };
    add(argv[2]); add("-E"); add(argv[3]); add("-T"); add(argv[4]);
    for (int i = 6; i < argc; ++i) add(argv[i]);
    std::vector<LPCWSTR> pointers;
    for (const auto& argument : arguments) pointers.push_back(argument.c_str());
    Interface<IDxcIncludeHandler> include;
    require(utilities->CreateDefaultIncludeHandler(&include.value), "create include handler");
    const DxcBuffer buffer{source.data(), source.size(), DXC_CP_UTF8};
    Interface<IDxcResult> result;
    const auto begin = std::chrono::steady_clock::now();
    require(compiler->Compile(&buffer, pointers.data(), static_cast<UINT32>(pointers.size()),
                             include.value, __uuidof(IDxcResult), result.address()), "compile API");
    const double milliseconds = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - begin).count();
    Interface<IDxcBlobUtf8> errors;
    require(result->GetOutput(DXC_OUT_ERRORS, __uuidof(IDxcBlobUtf8), errors.address(), nullptr), "diagnostics");
    if (errors.value && errors->GetStringLength())
      std::cerr.write(errors->GetStringPointer(), errors->GetStringLength());
    HRESULT status;
    require(result->GetStatus(&status), "compilation status");
    if (FAILED(status)) {
      std::cout << "COMPILE_FAILED ELAPSED_MS " << milliseconds << '\n';
      return 1;
    }
    Interface<IDxcBlob> object;
    require(result->GetOutput(DXC_OUT_OBJECT, __uuidof(IDxcBlob), object.address(), nullptr), "compiled object");
    if (!object.value || object->GetBufferSize() == 0) throw std::runtime_error("Empty compiled object");
    std::ofstream output(argv[5], std::ios::binary);
    output.write(static_cast<const char*>(object->GetBufferPointer()), object->GetBufferSize());
    if (!output) throw std::runtime_error("Could not write compiled object");
    std::cout << "COMPILE_PASSED BYTES " << object->GetBufferSize()
              << " ELAPSED_MS " << milliseconds << '\n';
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "TOOL_ERROR " << error.what() << '\n';
    return 2;
  }
}
