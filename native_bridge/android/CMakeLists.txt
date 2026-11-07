cmake_minimum_required(VERSION 3.22.1)
project("alpha_mmap_arena" LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(
    alpha_mmap_arena
    SHARED
    alpha_mmap_arena_jni.cpp
)

target_compile_options(
    alpha_mmap_arena
    PRIVATE
    -O3
    -Wall
    -Wextra
    -fvisibility=hidden
    -D_FILE_OFFSET_BITS=64
)

find_library(log-lib log)
find_library(android-lib android)

target_link_libraries(
    alpha_mmap_arena
    ${log-lib}${android-lib}
)
