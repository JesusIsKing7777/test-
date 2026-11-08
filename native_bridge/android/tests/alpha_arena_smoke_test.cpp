#include <cassert>
#include <cctype>
#include <cstdlib>
#include <cstring>
#include <fcntl.h>
#include <iostream>
#include <string>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <unordered_map>
#include <vector>

static std::vector<std::string> basicSplit(const std::string& text) {
    std::vector<std::string> out;
    std::string cur;
    for (unsigned char uc : text) {
        char c = static_cast<char>(std::tolower(uc));
        if (std::isspace(uc)) {
            if (!cur.empty()) { out.push_back(cur); cur.clear(); }
        } else if (!std::isalnum(uc)) {
            if (!cur.empty()) { out.push_back(cur); cur.clear(); }
            out.emplace_back(1, c);
        } else { cur.push_back(c); }
    }
    if (!cur.empty()) out.push_back(cur);
    return out;
}

static std::vector<int> wordPieceEncode(const std::string& text, const std::unordered_map<std::string, int>& vocab) {
    std::vector<int> ids;
    int unk = vocab.at("[UNK]");
    for (const auto& w : basicSplit(text)) {
        if (auto it = vocab.find(w); it != vocab.end()) { ids.push_back(it->second); continue; }
        size_t start = 0; bool ok = true; std::vector<int> parts;
        while (start < w.size()) {
            size_t end = w.size(); int found = -1;
            while (start < end) {
                std::string key = (start == 0 ? "" : "##") + w.substr(start, end - start);
                if (auto it = vocab.find(key); it != vocab.end()) { found = it->second; break; }
                --end;
            }
            if (found < 0) { ok = false; break; }
            parts.push_back(found); start = end;
        }
        if (ok) ids.insert(ids.end(), parts.begin(), parts.end());
        else ids.push_back(unk);
    }
    return ids;
}

int main() {
    std::unordered_map<std::string, int> vocab = {
        {"[PAD]",0}, {"[UNK]",1}, {"[CLS]",2}, {"[SEP]",3},
        {"un",4}, {"##safe",5}, {"llama",6}, {"-",7}, {"3",8},
        {"can",9}, {"'",10}, {"t",11}, {"fail",17}, {"##ing",18}
    };
    auto ids = wordPieceEncode("Can't unsafe failing", vocab);
    std::vector<int> expected = {9, 10, 11, 4, 5, 17, 18};
    assert(ids == expected);

    const char* envTmp = std::getenv("TMPDIR");
    std::string dir = (envTmp && envTmp[0] != '\0') ? envTmp : ".";
    while (dir.size() > 1 && dir.back() == '/') dir.pop_back();
    std::string tmplStr = dir + "/alpha_weights_XXXXXX";
    std::vector<char> tmpl(tmplStr.begin(), tmplStr.end());
    tmpl.push_back('\0');

    int fd = mkstemp(tmpl.data());
    assert(fd >= 0);
    const char payload[] = "ALPHA_INT4_MMAP_ARENA_OK";
    assert(write(fd, payload, sizeof(payload)) == sizeof(payload));
    struct stat st{};
    assert(fstat(fd, &st) == 0);
    void* mapped = mmap(nullptr, static_cast<size_t>(st.st_size), PROT_READ, MAP_PRIVATE, fd, 0);
    assert(mapped != MAP_FAILED);
    assert(std::memcmp(mapped, payload, sizeof(payload)) == 0);
    void* scratch = std::aligned_alloc(64, 4096);
    assert(scratch != nullptr);
    std::free(scratch);
    munmap(mapped, static_cast<size_t>(st.st_size));
    close(fd);
    unlink(tmpl.data());

    std::cout << "[OK] C++17 WordPiece ## parity + TMPDIR POSIX mmap smoke passed.\n";
    return 0;
}
