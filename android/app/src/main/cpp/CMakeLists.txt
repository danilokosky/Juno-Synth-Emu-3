cmake_minimum_required(VERSION 3.22.1)
project("herajuno" CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(
    herajuno
    SHARED
    native-lib.cpp
)

find_library(log-lib log)
find_library(aaudio-lib aaudio)

target_link_libraries(
    herajuno
    ${log-lib}
    ${aaudio-lib}
)
