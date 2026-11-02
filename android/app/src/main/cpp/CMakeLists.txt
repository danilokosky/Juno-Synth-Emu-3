cmake_minimum_required(VERSION 3.22.1)

project("hera_juno" LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(
    hera_juno
    SHARED
    native-lib.cpp
)

target_compile_options(
    hera_juno
    PRIVATE
    -O3
    -ffast-math
    -Wall
    -Wextra
    -Wno-unused-parameter
)

find_library(log-lib log)
find_library(aaudio-lib aaudio)

target_link_libraries(
    hera_juno
    ${log-lib}
    ${aaudio-lib}
)
